package storage

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

// LocalBackend stores uploaded files on local disk — the zero-config default
// for self-hosted deployments that haven't set up S3-compatible storage
// (see docs/decisions/0003-local-storage-fallback.md). Object keys are
// always server-generated (ProjectKey below), never taken from client
// input, so there is no path-traversal surface here.
type LocalBackend struct {
	RootDir string
}

// ProjectKey builds the same "projectID/date/uuid.ext" shape the S3 backend
// uses, so both backends produce interchangeable object keys. The extension
// comes from the validated content type, never from the client's filename,
// so an upload approved as image/png cannot be stored (and later served) as
// .html or .svg.
func ProjectKey(projectID, contentType string) string {
	return strings.Join([]string{
		projectID,
		time.Now().UTC().Format("2006-01-02"),
		uuid.NewString() + ExtForContentType(contentType),
	}, "/")
}

// ExtForContentType maps a declared content type to a safe file extension.
// Anything unrecognised becomes ".bin" (served as a download).
func ExtForContentType(contentType string) string {
	ct := strings.ToLower(strings.TrimSpace(strings.SplitN(contentType, ";", 2)[0]))
	switch ct {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "application/pdf":
		return ".pdf"
	case "text/plain":
		return ".txt"
	case "text/csv":
		return ".csv"
	case "application/zip":
		return ".zip"
	case "application/json":
		return ".json"
	default:
		return ".bin"
	}
}

var errKeyEscapesRoot = errors.New("object key escapes storage root")

// resolvePath maps an object key to an absolute path under RootDir,
// rejecting anything that would escape RootDir (defense in depth — keys are
// always server-generated, but this makes that invariant load-bearing
// rather than merely assumed).
func (b *LocalBackend) resolvePath(objectKey string) (string, error) {
	clean := filepath.Clean("/" + objectKey) // normalizes ".." segments against a fixed root
	full := filepath.Join(b.RootDir, clean)
	rootWithSep := filepath.Clean(b.RootDir) + string(os.PathSeparator)
	if !strings.HasPrefix(full+string(os.PathSeparator), rootWithSep) && full != filepath.Clean(b.RootDir) {
		return "", errKeyEscapesRoot
	}
	return full, nil
}

// WriteObject streams r into objectKey, refusing anything past maxBytes.
// The write goes to a temp file first and is renamed into place, so a
// failed/interrupted upload never leaves a partial file at the final path.
func (b *LocalBackend) WriteObject(objectKey string, r io.Reader, maxBytes int64) error {
	full, err := b.resolvePath(objectKey)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(filepath.Dir(full), ".upload-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath) // no-op once renamed

	limited := io.LimitReader(r, maxBytes+1)
	n, err := io.Copy(tmp, limited)
	closeErr := tmp.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if n > maxBytes {
		return fmt.Errorf("upload exceeds max size of %d bytes", maxBytes)
	}
	return os.Rename(tmpPath, full)
}

// OpenObject opens a previously written object for reading.
func (b *LocalBackend) OpenObject(objectKey string) (*os.File, error) {
	full, err := b.resolvePath(objectKey)
	if err != nil {
		return nil, err
	}
	return os.Open(full)
}
