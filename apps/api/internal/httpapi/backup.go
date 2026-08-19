package httpapi

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/db"
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

// restoreMaxBackupBytes caps how large an uploaded backup file can be —
// this is a fresh-install-only endpoint (see below) but still shouldn't
// accept an unbounded body.
const restoreMaxBackupBytes = 500 * 1024 * 1024

// CreateBackup streams a full-instance backup as a zip download. Admin-only
// (same AdminGuard as /users*). See docs/decisions/0004 for exactly what's
// included/excluded, and docs/roadmap/00-MASTER-PLAN.md for what's not yet
// built (scheduled backups, S3 backup destinations, restore-over-an-active-
// install).
func (s *Server) CreateBackup(c *gin.Context) {
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := writeEntry("manifest.json", bytes.NewReader(manifestBytes)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, table := range db.BackupTables() {
		var tbuf bytes.Buffer
		if _, err := s.store.DumpTableJSONL(&tbuf, table); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "dumping " + table + ": " + err.Error()})
			return
		}
		if err := writeEntry("data/"+table+".jsonl", &tbuf); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "archiving local uploads: " + walkErr.Error()})
		return
	}

	checksumBytes, err := json.MarshalIndent(checksums, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	cw, err := zw.Create("checksums.json")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if _, err := cw.Write(checksumBytes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := zw.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filename := fmt.Sprintf("submify-backup-%s.zip", time.Now().UTC().Format("20060102-150405"))
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// RestoreSystem restores a backup produced by CreateBackup — but only onto
// a fresh install (no accounts yet), the same invariant /auth/register
// enforces, and reachable the same unauthenticated way for the same reason:
// there's no admin account to authenticate as before the first restore.
// Restoring over an already-active installation is a separate, harder,
// deliberately-not-yet-built flow — see docs/decisions/0004.
func (s *Server) RestoreSystem(c *gin.Context) {
	hasUsers, err := s.store.HasAnyUser()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if hasUsers {
		c.JSON(http.StatusForbidden, gin.H{"error": "restore is only available on a fresh install with no existing accounts — this instance already has one"})
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, restoreMaxBackupBytes)
	fileHeader, err := c.FormFile("backup")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing backup file (multipart field \"backup\")"})
		return
	}
	uploaded, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer uploaded.Close()
	data, err := io.ReadAll(uploaded)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reading upload: " + err.Error()})
		return
	}

	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a valid backup archive: " + err.Error()})
		return
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid backup: " + err.Error()})
		return
	}
	var manifest backupManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid backup manifest: " + err.Error()})
		return
	}
	if manifest.Product != "submify" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a Submify backup"})
		return
	}
	if manifest.BackupVersion > backupFormatVersion {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this backup was created by a newer, incompatible version of Submify"})
		return
	}

	checksumBytes, err := readEntry("checksums.json")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid backup: " + err.Error()})
		return
	}
	var checksums map[string]string
	if err := json.Unmarshal(checksumBytes, &checksums); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid backup checksums: " + err.Error()})
		return
	}

	// Integrity check every entry before writing anything — a corrupted or
	// tampered backup must never be accepted silently (brief §25).
	for name, zf := range entries {
		if name == "checksums.json" {
			continue
		}
		want, ok := checksums[name]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "backup is missing a checksum for " + name + " — refusing to restore"})
			return
		}
		rc, err := zf.Open()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		h := sha256.New()
		_, copyErr := io.Copy(h, rc)
		rc.Close()
		if copyErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": copyErr.Error()})
			return
		}
		if hex.EncodeToString(h.Sum(nil)) != want {
			c.JSON(http.StatusBadRequest, gin.H{"error": "backup integrity check failed for " + name + " — refusing to restore a corrupted backup"})
			return
		}
	}

	tx, err := s.store.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer tx.Rollback()

	restoredRows := map[string]int{}
	for _, table := range db.BackupTables() {
		zf, ok := entries["data/"+table+".jsonl"]
		if !ok {
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		n, err := db.RestoreTableJSONL(tx, table, rc)
		rc.Close()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		restoredRows[table] = n
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "restore failed: " + err.Error()})
		return
	}

	// Local-storage files are restored after the DB commit succeeds — the
	// database is the primary consistency guarantee; a partial file-restore
	// failure is reported but doesn't roll back already-committed data.
	filesRestored := 0
	var fileWarnings []string
	for name, zf := range entries {
		key := strings.TrimPrefix(name, "uploads/")
		if key == name { // didn't have the prefix
			continue
		}
		rc, err := zf.Open()
		if err != nil {
			fileWarnings = append(fileWarnings, key+": "+err.Error())
			continue
		}
		writeErr := s.localStorage.WriteObject(key, rc, int64(zf.UncompressedSize64))
		rc.Close()
		if writeErr != nil {
			fileWarnings = append(fileWarnings, key+": "+writeErr.Error())
			continue
		}
		filesRestored++
	}

	resp := gin.H{"status": "restored", "tables": restoredRows, "files_restored": filesRestored}
	if len(fileWarnings) > 0 {
		resp["file_warnings"] = fileWarnings
	}
	c.JSON(http.StatusOK, resp)
}
