package httpapi

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/nodedr/submify/apps/api/internal/auth"
	"github.com/nodedr/submify/apps/api/internal/keys"
	"github.com/nodedr/submify/apps/api/internal/storage"
)

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
	Name             string    `json:"name"`
	RegenerateKey    bool      `json:"regenerate_key"`
	AllowedOrigins   *[]string `json:"allowed_origins"`
	TelegramBotToken *string   `json:"telegram_bot_token"`
	TelegramChatID   *string   `json:"telegram_chat_id"`
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

type registerRequest struct {
	FullName string `json:"full_name" binding:"required"`
	Phone    string `json:"phone" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

type userIntegrationsRequest struct {
	TelegramBotToken *string `json:"telegram_bot_token"`
	TelegramChatID   *string `json:"telegram_chat_id"`
	S3Endpoint       *string `json:"s3_endpoint"`
	S3AccessKey      *string `json:"s3_access_key"`
	S3SecretKey      *string `json:"s3_secret_key"`
	S3Bucket         *string `json:"s3_bucket"`
}

func (s *Server) BootstrapStatus(c *gin.Context) {
	has, err := s.store.HasAnyUser()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"setup_required": !has})
}

func (s *Server) SetupSystem(c *gin.Context) {
	c.JSON(http.StatusGone, gin.H{
		"error": "This endpoint is retired. Create an account with POST /api/v1/auth/register (name, phone, email, password). Optional Telegram and S3 are configured in the dashboard after login.",
	})
}

func (s *Server) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u, err := s.store.RegisterUser(strings.TrimSpace(req.FullName), strings.TrimSpace(req.Phone), strings.TrimSpace(req.Email), hash)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
			return
		}
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(err.Error(), "unique") {
			c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	access, refresh, err := s.tokens.GeneratePair(u.ID, u.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"access_token": access, "refresh_token": refresh, "api_key": u.APIKey,
		"email": u.Email, "full_name": u.FullName, "phone": u.Phone,
	})
}

func (s *Server) Health(c *gin.Context) {
	if err := s.store.DB.Ping(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "degraded", "db": "down"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "db": "up"})
}

// DashboardSummary returns update metadata plus the user's most recent submission (for dashboard notifications).
func (s *Server) DashboardSummary(c *gin.Context) {
	force := c.Query("refresh") == "1" || c.Query("refresh") == "true"
	s.refreshGitHubVersion(force)

	uid := userIDFromContext(c)
	snap, err := s.store.LatestSubmissionSnapshotForUser(uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var latestSub interface{}
	if snap != nil {
		latestSub = gin.H{
			"at":           snap.CreatedAt.UTC().Format(time.RFC3339),
			"project_id":   snap.ProjectID,
			"project_name": snap.ProjectName,
		}
	}

	cfg, err := s.store.GetSystemConfig()
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusOK, gin.H{
				"update_available":       false,
				"latest_version":         "",
				"current_version":        s.cfg.AppVersion,
				"update_trigger_enabled": s.cfg.AllowUpdateTrigger,
				"latest_submission":      latestSub,
				"update_run":             s.getUpdateRunStatus(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"update_available":       cfg.UpdateAvail,
		"latest_version":         cfg.LatestVersion,
		"current_version":        s.cfg.AppVersion,
		"update_trigger_enabled": s.cfg.AllowUpdateTrigger,
		"latest_submission":      latestSub,
		"update_run":             s.getUpdateRunStatus(),
	})
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
		"full_name": user.FullName, "phone": user.Phone,
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
	c.JSON(http.StatusOK, gin.H{
		"email":               u.Email,
		"api_key":             u.APIKey,
		"full_name":           u.FullName,
		"phone":               u.Phone,
		"telegram_chat_id":    strings.TrimSpace(u.TelegramChatID),
		"s3_endpoint":         strings.TrimSpace(u.S3Endpoint),
		"s3_bucket":           strings.TrimSpace(u.S3Bucket),
		"telegram_configured": strings.TrimSpace(u.TelegramBotToken) != "" && strings.TrimSpace(u.TelegramChatID) != "",
		"s3_configured": strings.TrimSpace(u.S3Endpoint) != "" && strings.TrimSpace(u.S3Bucket) != "" &&
			strings.TrimSpace(u.S3AccessKey) != "" && strings.TrimSpace(u.S3SecretKey) != "",
	})
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
		"full_name": u.FullName, "phone": u.Phone,
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
	project, err := s.store.CreateProject(userIDFromContext(c), req.Name, false)
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
		pk, err := keys.NewAPIKey()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		sk, err := keys.NewAPISecret()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if err := s.store.RegenerateProjectKeys(userID, id, pk, sk); err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
	}
	if req.AllowedOrigins != nil {
		if err := s.store.UpdateProjectAllowedOrigins(userID, id, *req.AllowedOrigins); err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
	}
	if req.TelegramBotToken != nil || req.TelegramChatID != nil {
		currentProject, err := s.store.ProjectOwnedBy(userID, id)
		if err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
		mergedToken := mergeIntegrationField(currentProject.TelegramBotToken, req.TelegramBotToken)
		mergedChatID := mergeIntegrationField(currentProject.TelegramChatID, req.TelegramChatID)
		if err := s.store.UpdateProjectTelegram(userID, id, mergedToken, mergedChatID); err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
	}
	p, err := s.store.ProjectOwnedBy(userID, id)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated", "project": p})
}

func (s *Server) Submit(c *gin.Context) {
	max := s.cfg.SubmitMaxBodyBytes
	if max < 1024 {
		max = 1024 * 1024
	}
	rawBody, err := io.ReadAll(io.LimitReader(c.Request.Body, max+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "could not read body"})
		return
	}
	if int64(len(rawBody)) > max {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "payload too large"})
		return
	}
	t := bytes.TrimSpace(rawBody)
	if len(t) == 0 || bytes.Equal(t, []byte("null")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty submission"})
		return
	}

	headerKey := strings.TrimSpace(c.GetHeader("x-api-key"))
	if headerKey == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing x-api-key"})
		return
	}
	// Reject garbage before DB; only pk_live_* or legacy UUID-shaped keys proceed.
	if !isPlausiblePublicAPIKey(headerKey) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid x-api-key"})
		return
	}

	project, err := s.store.FindProjectByPublicKey(headerKey)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unknown or revoked x-api-key"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	reqOrigin := requestOriginOrReferer(c)
	if !OriginMatchesAllowlist(project.AllowedOrigins, reqOrigin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "origin not allowed for this project"})
		return
	}

	sig := strings.TrimSpace(c.GetHeader("x-signature"))
	if sig != "" {
		if !verifyHMACSHA256Hex(project.APISecret, rawBody, sig) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(rawBody, &raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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

	ip := clientIPFromRequest(c)
	ua := strings.TrimSpace(c.GetHeader("User-Agent"))

	sub, err := s.store.InsertSubmission(project.ID, dataBytes, filesBytes, ip, ua)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("submit: project_id=%s submission_id=%s ip=%s ua_len=%d", project.ID, sub.ID, ip, len(ua))

	notifyTelegram(project, dataBytes, filesBytes)

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
	u, err := s.store.FindUserByID(userIDFromContext(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(u.S3Endpoint) == "" || strings.TrimSpace(u.S3Bucket) == "" ||
		strings.TrimSpace(u.S3AccessKey) == "" || strings.TrimSpace(u.S3SecretKey) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "configure S3-compatible storage in Settings (optional until you need large file uploads)"})
		return
	}
	result, err := storage.PresignUpload(c.Request.Context(), makePresignInputFromUser(u, req.ProjectID, req.Filename, s.cfg.PresignExpiryMinutes))
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

func mergeIntegrationField(current string, patch *string) string {
	if patch == nil {
		return current
	}
	return strings.TrimSpace(*patch)
}

func (s *Server) UpdateUserIntegrations(c *gin.Context) {
	var req userIntegrationsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u, err := s.store.FindUserByID(userIDFromContext(c))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := s.store.UpdateUserIntegrations(
		u.ID,
		mergeIntegrationField(u.TelegramBotToken, req.TelegramBotToken),
		mergeIntegrationField(u.TelegramChatID, req.TelegramChatID),
		mergeIntegrationField(u.S3Endpoint, req.S3Endpoint),
		mergeIntegrationField(u.S3AccessKey, req.S3AccessKey),
		mergeIntegrationField(u.S3SecretKey, req.S3SecretKey),
		mergeIntegrationField(u.S3Bucket, req.S3Bucket),
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

