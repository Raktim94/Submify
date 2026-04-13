package httpapi

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/auth"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/storage"
)

type setupRequest struct {
	S3Endpoint     string `json:"s3_endpoint" binding:"required"`
	S3AccessKey    string `json:"s3_access_key" binding:"required"`
	S3SecretKey    string `json:"s3_secret_key" binding:"required"`
	S3Bucket       string `json:"s3_bucket" binding:"required"`
	TelegramToken  string `json:"telegram_bot_token" binding:"required"`
	TelegramChatID string `json:"telegram_chat_id" binding:"required"`
	AdminEmail     string `json:"admin_email" binding:"required,email"`
	AdminPassword  string `json:"admin_password" binding:"required,min=8"`
}

type updateConfigRequest struct {
	S3Endpoint     string `json:"s3_endpoint" binding:"required"`
	S3AccessKey    string `json:"s3_access_key" binding:"required"`
	S3SecretKey    string `json:"s3_secret_key" binding:"required"`
	S3Bucket       string `json:"s3_bucket" binding:"required"`
	TelegramToken  string `json:"telegram_bot_token" binding:"required"`
	TelegramChatID string `json:"telegram_chat_id" binding:"required"`
}

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type createProjectRequest struct {
	Name string `json:"name" binding:"required"`
}

type updateProjectRequest struct {
	Name          string `json:"name"`
	RegenerateKey bool   `json:"regenerate_key"`
}

type presignRequest struct {
	ProjectID   string `json:"project_id" binding:"required"`
	Filename    string `json:"filename" binding:"required"`
	ContentType string `json:"content_type" binding:"required"`
	Size        int64  `json:"size" binding:"required"`
}

type bulkDeleteRequest struct {
	SubmissionIDs []string `json:"submission_ids" binding:"required"`
}

func (s *Server) BootstrapStatus(c *gin.Context) {
	complete, err := s.store.BootstrapComplete()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"setup_required": !complete})
}

func (s *Server) SetupSystem(c *gin.Context) {
	var req setupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash, err := auth.HashPassword(req.AdminPassword)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err = s.store.CreateInitialSystemConfig(db.SystemConfig{
		S3Endpoint:     req.S3Endpoint,
		S3AccessKey:    req.S3AccessKey,
		S3SecretKey:    req.S3SecretKey,
		S3Bucket:       req.S3Bucket,
		TelegramToken:  req.TelegramToken,
		TelegramChatID: req.TelegramChatID,
		AdminEmail:     req.AdminEmail,
		AdminHash:      hash,
	})
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"status": "setup complete"})
}

func (s *Server) Health(c *gin.Context) {
	if err := s.store.DB.Ping(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "db": "down", "s3": "unknown"})
		return
	}

	s3Status := "not_configured"
	complete, err := s.store.BootstrapComplete()
	if err == nil && complete {
		cfg, cfgErr := s.store.GetSystemConfig()
		if cfgErr == nil {
			if err := storage.CheckBucket(c.Request.Context(), cfg.S3Endpoint, cfg.S3AccessKey, cfg.S3SecretKey, cfg.S3Bucket); err != nil {
				s3Status = "down"
				c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "db": "up", "s3": s3Status})
				return
			}
			s3Status = "up"
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "db": "up", "s3": s3Status})
}

func (s *Server) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, err := s.store.FindUserByEmail(req.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !auth.VerifyPassword(req.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	access, refresh, err := s.tokens.GeneratePair(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"access_token": access, "refresh_token": refresh, "api_key": user.APIKey,
	})
}

func (s *Server) GetMe(c *gin.Context) {
	u, err := s.store.FindUserByID(userIDFromContext(c))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"email": u.Email, "api_key": u.APIKey})
}

func (s *Server) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claims, err := s.tokens.Parse(req.RefreshToken, "refresh")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}
	access, refresh, err := s.tokens.GeneratePair(claims.UserID, claims.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u, err := s.store.FindUserByID(claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"access_token": access, "refresh_token": refresh, "api_key": u.APIKey,
	})
}

func (s *Server) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "logged out"})
}

func (s *Server) CreateProject(c *gin.Context) {
	var req createProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	project, err := s.store.CreateProject(userIDFromContext(c), req.Name, projectAPIKey(), false)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, project)
}

func (s *Server) ListProjects(c *gin.Context) {
	items, err := s.store.ListProjects(userIDFromContext(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"projects": items})
}

func (s *Server) UpdateProject(c *gin.Context) {
	var req updateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := c.Param("id")
	userID := userIDFromContext(c)

	if strings.TrimSpace(req.Name) != "" {
		if err := s.store.UpdateProjectName(userID, id, req.Name); err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
	}
	if req.RegenerateKey {
		if err := s.store.RegenerateAPIKey(userID, id, projectAPIKey()); err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

func (s *Server) Submit(c *gin.Context) {
	projectKey := c.Param("project_key")
	headerKey := c.GetHeader("x-api-key")
	if headerKey == "" || headerKey != projectKey {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid api key"})
		return
	}

	var project db.Project
	var err error
	if u, e := s.store.FindUserByAPIKey(headerKey); e == nil {
		project, err = s.store.EnsureDefaultInboxProject(u.ID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else if errors.Is(e, sql.ErrNoRows) {
		project, err = s.store.FindProjectByAPIKey(headerKey)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid api key"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		c.JSON(http.StatusInternalServerError, gin.H{"error": e.Error()})
		return
	}

	count, err := s.store.CountSubmissions(project.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if count >= 5000 {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "submission limit reached (5000). export and delete old data."})
		return
	}

	var raw map[string]interface{}
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dataPart := raw
	filesPart := []interface{}{}
	if d, ok := raw["data"]; ok {
		if mapped, ok := d.(map[string]interface{}); ok {
			dataPart = mapped
		}
	}
	if f, ok := raw["files"]; ok {
		if arr, ok := f.([]interface{}); ok {
			filesPart = arr
		}
	}

	dataBytes, _ := json.Marshal(dataPart)
	filesBytes, _ := json.Marshal(filesPart)

	sub, err := s.store.InsertSubmission(project.ID, dataBytes, filesBytes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if cfg, err := s.store.GetSystemConfig(); err == nil {
		notifyTelegram(project, cfg, dataBytes, filesBytes)
	}

	c.JSON(http.StatusCreated, sub)
}

func (s *Server) PresignUpload(c *gin.Context) {
	var req presignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Size > s.cfg.UploadMaxSizeBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large"})
		return
	}
	if _, ok := s.cfg.AllowedMIMETypes[req.ContentType]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "mime type not allowed"})
		return
	}
	if _, err := s.store.ProjectOwnedBy(userIDFromContext(c), req.ProjectID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	cfg, err := s.store.GetSystemConfig()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage unavailable"})
		return
	}
	result, err := storage.PresignUpload(c.Request.Context(), makePresignInput(cfg, req.ProjectID, req.Filename, s.cfg.PresignExpiryMinutes))
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "storage unavailable"})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (s *Server) ListSubmissions(c *gin.Context) {
	projectID := c.Param("id")
	if _, err := s.store.ProjectOwnedBy(userIDFromContext(c), projectID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	limit := 50
	offset := 0
	if raw := c.Query("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 500 {
			limit = parsed
		}
	}
	if raw := c.Query("offset"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 {
			offset = parsed
		}
	}
	rows, err := s.store.ListSubmissions(projectID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"submissions": rows, "limit": limit, "offset": offset})
}

func (s *Server) BulkDeleteSubmissions(c *gin.Context) {
	projectID := c.Param("id")
	if _, err := s.store.ProjectOwnedBy(userIDFromContext(c), projectID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	var req bulkDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	deleted, err := s.store.DeleteSubmissions(projectID, req.SubmissionIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": deleted})
}

func (s *Server) Export(c *gin.Context) {
	projectID := c.Param("id")
	if _, err := s.store.ProjectOwnedBy(userIDFromContext(c), projectID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	rows, err := s.store.ListSubmissions(projectID, 5000, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	format := strings.ToLower(c.DefaultQuery("format", "xlsx"))
	if format == "pdf" {
		bytes, err := writePDF(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Header("Content-Disposition", "attachment; filename=submissions.pdf")
		c.Data(http.StatusOK, "application/pdf", bytes)
		return
	}
	bytes, err := writeExcel(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", "attachment; filename=submissions.xlsx")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes)
}

func (s *Server) UpdateSystemConfig(c *gin.Context) {
	var req updateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg := db.SystemConfig{
		S3Endpoint:     req.S3Endpoint,
		S3AccessKey:    req.S3AccessKey,
		S3SecretKey:    req.S3SecretKey,
		S3Bucket:       req.S3Bucket,
		TelegramToken:  req.TelegramToken,
		TelegramChatID: req.TelegramChatID,
	}
	if err := s.store.UpdateSystemConfig(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

