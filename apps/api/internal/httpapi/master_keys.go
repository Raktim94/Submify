package httpapi

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/keys"
)

// Master API keys — see docs/decisions/0012-master-api-keys-and-remote-mcp.md.

const maxMasterKeysPerOrg = 25

type createMasterKeyRequest struct {
	Name          string `json:"name" binding:"required"`
	ExpiresInDays int    `json:"expires_in_days"`
}

func hashMasterKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

// visibleMasterKeys returns the keys the caller may see and revoke: every
// key in the organization for an admin, otherwise only their own.
func (s *Server) visibleMasterKeys(c *gin.Context) ([]db.MasterAPIKey, error) {
	items, err := s.store.ListMasterAPIKeys(organizationIDFromContext(c))
	if err != nil {
		return nil, err
	}
	me, err := s.store.FindUserByID(userIDFromContext(c))
	if err != nil {
		return nil, err
	}
	if me.IsAdmin {
		return items, nil
	}
	own := []db.MasterAPIKey{}
	for _, k := range items {
		if k.UserID == me.ID {
			own = append(own, k)
		}
	}
	return own, nil
}

func (s *Server) ListMasterAPIKeys(c *gin.Context) {
	items, err := s.visibleMasterKeys(c)
	if err != nil {
		log.Printf("list master keys: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list API keys"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"api_keys": items})
}

func (s *Server) CreateMasterAPIKey(c *gin.Context) {
	var req createMasterKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 80 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name must be 1-80 characters"})
		return
	}
	if req.ExpiresInDays < 0 || req.ExpiresInDays > 3650 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "expires_in_days must be between 0 (never) and 3650"})
		return
	}
	orgID := organizationIDFromContext(c)
	existing, err := s.store.ListMasterAPIKeys(orgID)
	if err != nil {
		log.Printf("create master key: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create API key"})
		return
	}
	if len(existing) >= maxMasterKeysPerOrg {
		c.JSON(http.StatusConflict, gin.H{"error": "too many active API keys; revoke an unused one first"})
		return
	}
	plain, err := keys.NewMasterAPIKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create API key"})
		return
	}
	var expiresAt *time.Time
	if req.ExpiresInDays > 0 {
		t := time.Now().Add(time.Duration(req.ExpiresInDays) * 24 * time.Hour)
		expiresAt = &t
	}
	prefix := plain[:len(keys.MasterAPIKeyPrefix)+8]
	k, err := s.store.CreateMasterAPIKey(orgID, userIDFromContext(c), name, prefix, hashMasterKey(plain), expiresAt)
	if err != nil {
		log.Printf("create master key: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create API key"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"api_key": k, "key": plain})
}

func (s *Server) RevokeMasterAPIKey(c *gin.Context) {
	visible, err := s.visibleMasterKeys(c)
	if err != nil {
		log.Printf("revoke master key: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not revoke API key"})
		return
	}
	allowed := false
	for _, k := range visible {
		if k.ID == c.Param("id") {
			allowed = true
			break
		}
	}
	if !allowed {
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}
	if err := s.store.RevokeMasterAPIKey(organizationIDFromContext(c), c.Param("id")); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
			return
		}
		log.Printf("revoke master key: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not revoke API key"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "revoked"})
}
