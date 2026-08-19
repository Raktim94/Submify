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
// uses, so both backends produce interchangeable object keys.
func ProjectKey(projectID, filename string) string {
	ext := filepath.Ext(filename)
	return strings.Join([]string{
		projectID,
		time.Now().UTC().Format("2006-01-02"),
		uuid.NewString() + ext,
	}, "/")
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
