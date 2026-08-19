package httpapi

import (
	"io"
	"log"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// absoluteAPIURL turns a path on this API into an absolute URL, honoring
// X-Forwarded-Proto/Host from a trusted reverse proxy (nginx in front, per
// docker-compose.yml) so links work correctly behind TLS termination.
func (s *Server) absoluteAPIURL(c *gin.Context, path string) string {
	scheme := "http"
	if proto := c.Request.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	} else if c.Request.TLS != nil {
		scheme = "https"
	}
	host := c.Request.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = c.Request.Host
	}
	return scheme + "://" + host + path
}

// LocalUploadPut receives the actual file bytes for a presigned local
// upload — the local-storage equivalent of a client PUTting straight to
// S3. Public by design: the random token in the path *is* the
// authorization, exactly like a presigned S3 PUT URL's signature. It is
// single-use (storage.UploadTokenStore.Consume deletes it) and short-lived
// (PresignExpiryMinutes), and the object key was chosen by the server at
// presign time, never by this request.
func (s *Server) LocalUploadPut(c *gin.Context) {
	token := c.Param("token")
	entry, ok := s.uploadTokens.Consume(token)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "upload token not found or expired"})
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, entry.MaxBytes+1)
	if err := s.localStorage.WriteObject(entry.ObjectKey, c.Request.Body, entry.MaxBytes); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "upload failed: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "stored", "object_key": entry.ObjectKey})
}

// LocalUploadGet serves a previously stored local object back. Public by
// design, matching the existing (pre-existing, unchanged by this feature)
// assumption that an S3 object's URL is itself the access control — see
// docs/decisions/0003-local-storage-fallback.md for why local storage
// mirrors that model rather than introducing a stricter one just for
// itself.
func (s *Server) LocalUploadGet(c *gin.Context) {
	key := strings.TrimPrefix(c.Param("key"), "/")
	if key == "" || strings.Contains(key, "..") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid key"})
		return
	}
	f, err := s.localStorage.OpenObject(key)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	defer f.Close()

	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", `inline; filename="`+filepath.Base(key)+`"`)
	c.Header("X-Content-Type-Options", "nosniff")
	if _, err := io.Copy(c.Writer, f); err != nil {
		log.Printf("local download stream error key=%s: %v", key, err)
	}
}
