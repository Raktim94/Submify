package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/storage"
)

// backupFormatVersion must be bumped, with a compatibility check added
// here, the day a backed-up table's row shape changes in a way old
// backups can't be coerced into — see
// docs/decisions/0004-backup-format-pure-go-json-dump.md.
const backupFormatVersion = 1

type backupManifest struct {
	Product       string `json:"product"`
	BackupVersion int    `json:"backupVersion"`
	CreatedAt     string `json:"createdAt"`
}

// restoreMaxBackupBytes caps how large an uploaded backup file can be.
const restoreMaxBackupBytes = 500 * 1024 * 1024

// restoreConfirmPhrase gates every restore-over-an-active-install path
// (local upload and S3) — never the original fresh-install path, which
// has nothing to destroy yet. Mirrors the typed-confirmation pattern
// already proven for this exact problem in the sibling Zulivio product.
const restoreConfirmPhrase = "RESTORE"

// restoreBadInput marks a restore-validation failure (corrupt archive,
// wrong product, incompatible version, missing/mismatched checksum) as
// the caller's fault (→ 400 via restoreStatusCode), distinct from an
// internal error (→ 500) — applyRestoreArchive wraps these so every
// caller (fresh-install, S3, local-upload-over-active-install) gets the
// same status-code mapping without repeating the classification logic.
type restoreBadInput struct{ msg string }

func (e restoreBadInput) Error() string { return e.msg }

func badInput(format string, args ...interface{}) error {
	return restoreBadInput{msg: fmt.Sprintf(format, args...)}
}

func restoreStatusCode(err error) int {
	var bad restoreBadInput
	if errors.As(err, &bad) {
		return http.StatusBadRequest
	}
	return http.StatusInternalServerError
}

func backupFilename() string {
	return fmt.Sprintf("submify-backup-%s.zip", time.Now().UTC().Format("20060102-150405"))
}

// buildBackupArchive builds the exact same zip CreateBackup has always
// produced — extracted so the new S3 backup destination and the
// automatic pre-restore safety backup (see
// docs/decisions/0009-s3-backup-and-self-update.md) use the identical,
// already-checksummed format instead of a second implementation.
func (s *Server) buildBackupArchive() ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	checksums := map[string]string{}

	writeEntry := func(name string, r io.Reader) error {
		w, err := zw.Create(name)
		if err != nil {
			return err
		}
		h := sha256.New()
		if _, err := io.Copy(w, io.TeeReader(r, h)); err != nil {
			return err
		}
		checksums[name] = hex.EncodeToString(h.Sum(nil))
		return nil
	}

	manifest := backupManifest{
		Product:       "submify",
		BackupVersion: backupFormatVersion,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := writeEntry("manifest.json", bytes.NewReader(manifestBytes)); err != nil {
		return nil, err
	}

	for _, table := range db.BackupTables() {
		var tbuf bytes.Buffer
		if _, err := s.store.DumpTableJSONL(&tbuf, table); err != nil {
			return nil, fmt.Errorf("dumping %s: %w", table, err)
		}
		if err := writeEntry("data/"+table+".jsonl", &tbuf); err != nil {
			return nil, err
		}
	}

	// Local-storage uploads only — S3-stored files already live durably in
	// their external bucket and are deliberately not duplicated here.
	walkErr := filepath.WalkDir(s.cfg.LocalStorageDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(s.cfg.LocalStorageDir, path)
		if err != nil {
			return err
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		return writeEntry("uploads/"+filepath.ToSlash(rel), f)
	})
	if walkErr != nil {
		return nil, fmt.Errorf("archiving local uploads: %w", walkErr)
	}

	checksumBytes, err := json.MarshalIndent(checksums, "", "  ")
	if err != nil {
		return nil, err
	}
	cw, err := zw.Create("checksums.json")
	if err != nil {
		return nil, err
	}
	if _, err := cw.Write(checksumBytes); err != nil {
		return nil, err
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// CreateBackup streams a full-instance backup as a zip download. Admin-only
// (same AdminGuard as /users*).
func (s *Server) CreateBackup(c *gin.Context) {
	data, err := s.buildBackupArchive()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="`+backupFilename()+`"`)
	c.Data(http.StatusOK, "application/zip", data)
}

// applyRestoreArchive validates and restores a backup archive already in
// memory — shared by the fresh-install path (RestoreSystem), local-
// upload-over-active-install (RestoreSystemActive), and restore-from-S3
// (RestoreFromS3). Every write happens in one transaction; a validation
// failure (see restoreBadInput) never touches the database at all.
func (s *Server) applyRestoreArchive(data []byte) (tablesRestored map[string]int, filesRestored int, fileWarnings []string, err error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, 0, nil, badInput("not a valid backup archive: %s", err.Error())
	}
	entries := map[string]*zip.File{}
	for _, zf := range zr.File {
		entries[zf.Name] = zf
	}

	readEntry := func(name string) ([]byte, error) {
		zf, ok := entries[name]
		if !ok {
			return nil, fmt.Errorf("missing %s", name)
		}
		rc, err := zf.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		return io.ReadAll(rc)
	}

	manifestBytes, err := readEntry("manifest.json")
	if err != nil {
		return nil, 0, nil, badInput("invalid backup: %s", err.Error())
	}
	var manifest backupManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, 0, nil, badInput("invalid backup manifest: %s", err.Error())
	}
	if manifest.Product != "submify" {
		return nil, 0, nil, badInput("not a Submify backup")
	}
	if manifest.BackupVersion > backupFormatVersion {
		return nil, 0, nil, badInput("this backup was created by a newer, incompatible version of Submify")
	}

	checksumBytes, err := readEntry("checksums.json")
	if err != nil {
		return nil, 0, nil, badInput("invalid backup: %s", err.Error())
	}
	var checksums map[string]string
	if err := json.Unmarshal(checksumBytes, &checksums); err != nil {
		return nil, 0, nil, badInput("invalid backup checksums: %s", err.Error())
	}

	// Integrity check every entry before writing anything — a corrupted or
	// tampered backup must never be accepted silently (brief §25).
	for name, zf := range entries {
		if name == "checksums.json" {
			continue
		}
		want, ok := checksums[name]
		if !ok {
			return nil, 0, nil, badInput("backup is missing a checksum for %s — refusing to restore", name)
		}
		rc, err := zf.Open()
		if err != nil {
			return nil, 0, nil, badInput("%s", err.Error())
		}
		h := sha256.New()
		_, copyErr := io.Copy(h, rc)
		rc.Close()
		if copyErr != nil {
			return nil, 0, nil, badInput("%s", copyErr.Error())
		}
		if hex.EncodeToString(h.Sum(nil)) != want {
			return nil, 0, nil, badInput("backup integrity check failed for %s — refusing to restore a corrupted backup", name)
		}
	}

	tx, err := s.store.DB.Begin()
	if err != nil {
		return nil, 0, nil, err
	}
	defer tx.Rollback()

	// RestoreTableJSONL only INSERTs — harmless on the fresh-install path
	// (tables are already empty there) but restoring over an ALREADY-active
	// install (RestoreSystemActive/RestoreFromS3) means these tables already
	// hold rows with the same primary keys, so a plain insert would fail on
	// every row with a duplicate-key error. TRUNCATE first so "restore"
	// actually means "replace with the backup's contents," not "merge with
	// whatever is currently here." CASCADE is safe: every FK in this schema
	// is ON DELETE CASCADE from a table already in this list (or, for
	// refresh_sessions -> users, a table whose rows SHOULD be invalidated by
	// a destructive restore anyway). table names come only from the fixed
	// db.BackupTables() allowlist, never from the archive or request.
	var toTruncate []string
	for _, table := range db.BackupTables() {
		if _, ok := entries["data/"+table+".jsonl"]; ok {
			toTruncate = append(toTruncate, table)
		}
	}
	if len(toTruncate) > 0 {
		if _, err := tx.Exec(`TRUNCATE TABLE ` + strings.Join(toTruncate, ", ") + ` CASCADE`); err != nil {
			return nil, 0, nil, fmt.Errorf("clearing existing data before restore: %w", err)
		}
	}

	restoredRows := map[string]int{}
	for _, table := range db.BackupTables() {
		zf, ok := entries["data/"+table+".jsonl"]
		if !ok {
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			return nil, 0, nil, err
		}
		n, err := db.RestoreTableJSONL(tx, table, rc)
		rc.Close()
		if err != nil {
			return nil, 0, nil, err
		}
		restoredRows[table] = n
	}

	if err := tx.Commit(); err != nil {
		return nil, 0, nil, fmt.Errorf("restore failed: %w", err)
	}

	// Local-storage files are restored after the DB commit succeeds — the
	// database is the primary consistency guarantee; a partial file-restore
	// failure is reported but doesn't roll back already-committed data.
	restored := 0
	var warnings []string
	for name, zf := range entries {
		key := strings.TrimPrefix(name, "uploads/")
		if key == name { // didn't have the prefix
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			warnings = append(warnings, key+": "+err.Error())
			continue
		}
		writeErr := s.localStorage.WriteObject(key, rc, int64(zf.UncompressedSize64))
		rc.Close()
		if writeErr != nil {
			warnings = append(warnings, key+": "+writeErr.Error())
			continue
		}
		restored++
	}

	return restoredRows, restored, warnings, nil
}

func readUploadedBackupFile(c *gin.Context) ([]byte, error) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, restoreMaxBackupBytes)
	fileHeader, err := c.FormFile("backup")
	if err != nil {
		return nil, fmt.Errorf("missing backup file (multipart field \"backup\")")
	}
	uploaded, err := fileHeader.Open()
	if err != nil {
		return nil, err
	}
	defer uploaded.Close()
	data, err := io.ReadAll(uploaded)
	if err != nil {
		return nil, fmt.Errorf("reading upload: %w", err)
	}
	return data, nil
}

// RestoreSystem restores a backup produced by CreateBackup — but only onto
// a fresh install (no accounts yet), the same invariant /auth/register
// enforces, and reachable the same unauthenticated way for the same reason:
// there's no admin account to authenticate as before the first restore.
// Restoring over an already-active installation is RestoreSystemActive/
// RestoreFromS3 below — a deliberately separate, admin-gated, typed-
// confirmation-gated path with an automatic safety backup.
func (s *Server) RestoreSystem(c *gin.Context) {
	hasUsers, err := s.store.HasAnyUser()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hasUsers {
		c.JSON(http.StatusForbidden, gin.H{"error": "restore is only available on a fresh install with no existing accounts — this instance already has one; use the admin \"Restore\" action in Settings instead"})
		return
	}

	data, err := readUploadedBackupFile(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tables, files, warnings, err := s.applyRestoreArchive(data)
	if err != nil {
		c.JSON(restoreStatusCode(err), gin.H{"error": err.Error()})
		return
	}
	resp := gin.H{"status": "restored", "tables": tables, "files_restored": files}
	if len(warnings) > 0 {
		resp["file_warnings"] = warnings
	}
	c.JSON(http.StatusOK, resp)
}

// writeSafetyBackup saves an automatic pre-restore snapshot to local disk
// (deliberately not S3 — see config.SafetyBackupDir's own doc comment, and
// docs/decisions/0009) before ANY restore-over-an-active-install proceeds.
// This is the exact safety net ADR 0004 said restore-over-an-active-install
// couldn't ship without.
func (s *Server) writeSafetyBackup() (string, error) {
	data, err := s.buildBackupArchive()
	if err != nil {
		return "", fmt.Errorf("could not take pre-restore safety backup, refusing to proceed: %w", err)
	}
	if err := os.MkdirAll(s.cfg.SafetyBackupDir, 0o755); err != nil {
		return "", fmt.Errorf("could not create safety backup directory: %w", err)
	}
	name := "safety-" + time.Now().UTC().Format("20060102-150405") + ".zip"
	path := filepath.Join(s.cfg.SafetyBackupDir, name)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", fmt.Errorf("could not write safety backup: %w", err)
	}
	return path, nil
}

// RestoreSystemActive restores a LOCAL uploaded backup file over an
// already-active install. Admin-only, requires the exact confirmation
// phrase, and always takes an automatic pre-restore safety backup first —
// taken after the upload is read (so a bad/missing file fails fast without
// wasting a safety backup) but before the destructive restore itself.
func (s *Server) RestoreSystemActive(c *gin.Context) {
	if c.PostForm("confirm") != restoreConfirmPhrase {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type " + restoreConfirmPhrase + " to confirm — this permanently replaces all current data"})
		return
	}
	data, err := readUploadedBackupFile(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	safetyPath, err := s.writeSafetyBackup()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tables, files, warnings, err := s.applyRestoreArchive(data)
	if err != nil {
		c.JSON(restoreStatusCode(err), gin.H{"error": err.Error(), "safety_backup": safetyPath})
		return
	}
	resp := gin.H{"status": "restored", "tables": tables, "files_restored": files, "safety_backup": safetyPath}
	if len(warnings) > 0 {
		resp["file_warnings"] = warnings
	}
	c.JSON(http.StatusOK, resp)
}

// --- S3 backup destination (admin-only) -------------------------------------
//
// Uses SystemConfig's S3 fields, not users.s3_* (the per-account presigned-
// upload storage backend) — see docs/decisions/0009 for why conflating the
// two would be surprising.

const s3BackupPrefix = "backups/"

type s3BackupConfigRequest struct {
	Endpoint  string `json:"endpoint"`
	AccessKey string `json:"access_key"`
	SecretKey string `json:"secret_key"`
	Bucket    string `json:"bucket"`
}

func (s *Server) SetBackupS3Config(c *gin.Context) {
	var req s3BackupConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.store.SetBackupS3Config(req.Endpoint, req.AccessKey, req.SecretKey, req.Bucket); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// backupS3Config loads and validates the configured backup S3 destination,
// writing the appropriate error response itself when unusable — callers
// just check the bool.
func (s *Server) backupS3Config(c *gin.Context) (storage.S3Config, bool) {
	cfg, err := s.loadBackupS3Config()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return storage.S3Config{}, false
	}
	if cfg == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "S3 backup destination is not configured — set it first"})
		return storage.S3Config{}, false
	}
	return *cfg, true
}

// loadBackupS3Config is the gin-free variant backupS3Config wraps — used by
// the HTTP handlers above (via backupS3Config) and by the background
// scheduler (checkS3BackupSchedule), which has no request/response to write
// errors to. Returns (nil, nil) when no S3 destination is configured yet.
func (s *Server) loadBackupS3Config() (*storage.S3Config, error) {
	sysCfg, err := s.store.GetSystemConfig()
	if err != nil {
		return nil, err
	}
	if sysCfg.S3Endpoint == "" || sysCfg.S3Bucket == "" {
		return nil, nil
	}
	return &storage.S3Config{
		Endpoint:  sysCfg.S3Endpoint,
		AccessKey: sysCfg.S3AccessKey,
		SecretKey: sysCfg.S3SecretKey,
		Bucket:    sysCfg.S3Bucket,
	}, nil
}

func (s *Server) BackupToS3(c *gin.Context) {
	s3cfg, ok := s.backupS3Config(c)
	if !ok {
		return
	}
	data, err := s.buildBackupArchive()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	key := s3BackupPrefix + backupFilename()
	if err := storage.UploadObject(c.Request.Context(), s3cfg, key, data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "uploading to S3: " + err.Error()})
		return
	}

	// Same retention rule applies whether a backup was scheduled or
	// triggered manually — otherwise manual backups would accumulate
	// unbounded while only the scheduler's own uploads get pruned.
	if existing, listErr := storage.ListObjects(c.Request.Context(), s3cfg, s3BackupPrefix); listErr == nil {
		s.pruneS3Backups(c.Request.Context(), s3cfg, existing)
	}

	c.JSON(http.StatusOK, gin.H{"status": "uploaded", "key": key, "size": len(data)})
}

// ListS3Backups lists available restore points, newest first — pass
// ?latest=1 to get just the newest one directly.
func (s *Server) ListS3Backups(c *gin.Context) {
	s3cfg, ok := s.backupS3Config(c)
	if !ok {
		return
	}
	objects, err := storage.ListObjects(c.Request.Context(), s3cfg, s3BackupPrefix)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "listing S3 backups: " + err.Error()})
		return
	}
	if c.Query("latest") == "1" {
		if len(objects) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "no backups found in S3"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"backup": objects[0]})
		return
	}
	c.JSON(http.StatusOK, gin.H{"backups": objects})
}

type restoreFromS3Request struct {
	Key     string `json:"key" binding:"required"`
	Confirm string `json:"confirm" binding:"required"`
}

// RestoreFromS3 downloads a chosen (or "latest") backup from the S3
// destination and restores it over the active install — same admin-only /
// typed-confirmation / automatic-safety-backup guards as RestoreSystemActive.
func (s *Server) RestoreFromS3(c *gin.Context) {
	var req restoreFromS3Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Confirm != restoreConfirmPhrase {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type " + restoreConfirmPhrase + " to confirm — this permanently replaces all current data"})
		return
	}
	s3cfg, ok := s.backupS3Config(c)
	if !ok {
		return
	}

	rc, err := storage.DownloadObject(c.Request.Context(), s3cfg, req.Key)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "downloading from S3: " + err.Error()})
		return
	}
	data, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	safetyPath, err := s.writeSafetyBackup()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tables, files, warnings, err := s.applyRestoreArchive(data)
	if err != nil {
		c.JSON(restoreStatusCode(err), gin.H{"error": err.Error(), "safety_backup": safetyPath})
		return
	}
	resp := gin.H{
		"status": "restored", "tables": tables, "files_restored": files,
		"safety_backup": safetyPath, "restored_from": req.Key,
	}
	if len(warnings) > 0 {
		resp["file_warnings"] = warnings
	}
	c.JSON(http.StatusOK, resp)
}

// checkS3BackupSchedule is called hourly from StartBackgroundJobs. It's a
// silent no-op unless an S3 backup destination is configured. Backup
// filenames are timestamp-sortable, so "when was the last backup" falls out
// of ListObjects' own newest-first ordering — no separate "last backup at"
// column to keep in sync. Errors are logged, not surfaced anywhere else
// (there's no admin session listening on an hourly background tick), same
// as dispatchDueReminders' own error handling.
func (s *Server) checkS3BackupSchedule() {
	cfg, err := s.loadBackupS3Config()
	if err != nil {
		log.Printf("S3 backup schedule check: loading config: %v", err)
		return
	}
	if cfg == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	existing, err := storage.ListObjects(ctx, *cfg, s3BackupPrefix)
	if err != nil {
		log.Printf("S3 backup schedule check: listing existing backups: %v", err)
		return
	}

	intervalDays := s.cfg.S3BackupIntervalDays
	if intervalDays <= 0 {
		intervalDays = 3
	}
	due := len(existing) == 0
	if !due {
		due = time.Since(existing[0].LastModified) >= time.Duration(intervalDays)*24*time.Hour
	}
	if !due {
		return
	}

	data, err := s.buildBackupArchive()
	if err != nil {
		log.Printf("S3 backup schedule check: building archive: %v", err)
		return
	}
	key := s3BackupPrefix + backupFilename()
	if err := storage.UploadObject(ctx, *cfg, key, data); err != nil {
		log.Printf("S3 backup schedule check: uploading %s: %v", key, err)
		return
	}
	log.Printf("Scheduled S3 backup uploaded: %s", key)

	s.pruneS3Backups(ctx, *cfg, append([]storage.ObjectInfo{{Key: key}}, existing...))
}

// pruneS3Backups keeps the newest retainCount backups and deletes the rest
// — objects is expected newest-first (the freshly-uploaded one prepended
// ahead of the pre-existing, already-sorted list). Best-effort: a failed
// delete is logged and skipped, never lets one bad object block pruning the
// others.
func (s *Server) pruneS3Backups(ctx context.Context, cfg storage.S3Config, objects []storage.ObjectInfo) {
	retain := s.cfg.S3BackupRetainCount
	if retain <= 0 {
		retain = 2
	}
	if len(objects) <= retain {
		return
	}
	for _, stale := range objects[retain:] {
		if err := storage.DeleteObject(ctx, cfg, stale.Key); err != nil {
			log.Printf("S3 backup schedule check: pruning %s: %v", stale.Key, err)
			continue
		}
		log.Printf("Pruned old S3 backup: %s", stale.Key)
	}
}
