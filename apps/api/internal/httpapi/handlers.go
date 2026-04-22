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
	S3Endpoint       *string   `json:"s3_endpoint"`
	S3AccessKey      *string   `json:"s3_access_key"`
	S3SecretKey      *string   `json:"s3_secret_key"`
	S3Bucket         *string   `json:"s3_bucket"`
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

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

func (s *Server) cookieSameSite() http.SameSite {
	switch s.cfg.AuthCookieSameSite {
	case "strict":
		return http.SameSiteStrictMode
	case "none":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}

func (s *Server) setSessionCookies(c *gin.Context, accessToken, refreshToken string) {
	secure := s.cfg.AuthCookieSecure
	sameSite := s.cookieSameSite()
	c.SetSameSite(sameSite)
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     accessCookieName,
		Value:    accessToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		Domain:   s.cfg.AuthCookieDomain,
		SameSite: sameSite,
	})
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     refreshCookieName,
		Value:    refreshToken,
		Path:     "/api/v1",
		HttpOnly: true,
		Secure:   secure,
		Domain:   s.cfg.AuthCookieDomain,
		SameSite: sameSite,
	})
}

func (s *Server) clearSessionCookies(c *gin.Context) {
	secure := s.cfg.AuthCookieSecure
	sameSite := s.cookieSameSite()
	c.SetSameSite(sameSite)
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     accessCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		Domain:   s.cfg.AuthCookieDomain,
		SameSite: sameSite,
	})
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/api/v1",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		Domain:   s.cfg.AuthCookieDomain,
		SameSite: sameSite,
	})
}

func refreshTokenFromRequest(c *gin.Context) string {
	if h := strings.TrimSpace(c.GetHeader("x-refresh-token")); h != "" {
		return h
	}
	if authHeader := strings.TrimSpace(c.GetHeader("Authorization")); strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}
	if cookie, err := c.Request.Cookie(refreshCookieName); err == nil && strings.TrimSpace(cookie.Value) != "" {
		return strings.TrimSpace(cookie.Value)
	}
	return ""
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
	access, _, refresh, refreshClaims, err := s.tokens.GeneratePairWithClaims(u.ID, u.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	exp := time.Now().UTC().Add(time.Duration(s.cfg.RefreshTokenTTLHours) * time.Hour)
	if refreshClaims.ExpiresAt != nil {
		exp = refreshClaims.ExpiresAt.Time
	}
	if err := s.store.CreateRefreshSession(refreshClaims.JTI, u.ID, exp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.setSessionCookies(c, access, refresh)
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

// DashboardSummary returns the user's most recent submission (for dashboard notifications).
func (s *Server) DashboardSummary(c *gin.Context) {
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

	c.JSON(http.StatusOK, gin.H{
		"latest_submission": latestSub,
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
	access, _, refresh, refreshClaims, err := s.tokens.GeneratePairWithClaims(user.ID, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	exp := time.Now().UTC().Add(time.Duration(s.cfg.RefreshTokenTTLHours) * time.Hour)
	if refreshClaims.ExpiresAt != nil {
		exp = refreshClaims.ExpiresAt.Time
	}
	if err := s.store.CreateRefreshSession(refreshClaims.JTI, user.ID, exp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.setSessionCookies(c, access, refresh)
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
	bodyBytes, _ := io.ReadAll(c.Request.Body)
	c.Request.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	if len(bytes.TrimSpace(bodyBytes)) > 0 {
		_ = json.Unmarshal(bodyBytes, &req)
	}
	rt := strings.TrimSpace(req.RefreshToken)
	if rt == "" {
		rt = refreshTokenFromRequest(c)
	}
	if rt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing refresh token"})
		return
	}
	claims, err := s.tokens.Parse(rt, "refresh")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}
	jti := claims.JTI
	if jti == "" {
		jti = claims.ID
	}

	rs, err := s.store.RefreshSessionByJTI(jti)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err == nil {
		if rs.RevokedAt.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh token revoked"})
			return
		}
		if !rs.ExpiresAt.After(time.Now()) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh token expired"})
			return
		}
		if rs.UserID != claims.UserID {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
			return
		}
	} else {
		exp := time.Now().UTC().Add(time.Duration(s.cfg.RefreshTokenTTLHours) * time.Hour)
		if claims.ExpiresAt != nil {
			exp = claims.ExpiresAt.Time
		}
		if err := s.store.CreateRefreshSession(jti, claims.UserID, exp); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	access, _, refresh, newRefreshClaims, err := s.tokens.GeneratePairWithClaims(claims.UserID, claims.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	newJTI := newRefreshClaims.JTI
	if newJTI == "" {
		newJTI = newRefreshClaims.ID
	}
	newExp := time.Now().UTC().Add(time.Duration(s.cfg.RefreshTokenTTLHours) * time.Hour)
	if newRefreshClaims.ExpiresAt != nil {
		newExp = newRefreshClaims.ExpiresAt.Time
	}
	if err := s.store.RotateRefreshSession(jti, newJTI, claims.UserID, newExp); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh token invalid"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	u, err := s.store.FindUserByID(claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.setSessionCookies(c, access, refresh)
	c.JSON(http.StatusOK, gin.H{
		"access_token": access, "refresh_token": refresh, "api_key": u.APIKey,
		"full_name": u.FullName, "phone": u.Phone,
	})
}

func (s *Server) Logout(c *gin.Context) {
	var req refreshRequest
	bodyBytes, _ := io.ReadAll(c.Request.Body)
	c.Request.Body = io.NopCloser(bytes.NewReader(bodyBytes))
	if len(bytes.TrimSpace(bodyBytes)) > 0 {
		_ = json.Unmarshal(bodyBytes, &req)
	}
	rt := strings.TrimSpace(req.RefreshToken)
	if rt == "" {
		rt = refreshTokenFromRequest(c)
	}
	s.clearSessionCookies(c)
	if rt == "" {
		c.JSON(http.StatusOK, gin.H{"status": "logged out"})
		return
	}
	claims, err := s.tokens.Parse(rt, "refresh")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "logged out"})
		return
	}
	jti := claims.JTI
	if jti == "" {
		jti = claims.ID
	}
	_ = s.store.RevokeRefreshSession(jti, claims.UserID)
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
	if req.S3Endpoint != nil || req.S3AccessKey != nil || req.S3SecretKey != nil || req.S3Bucket != nil {
		currentProject, err := s.store.ProjectOwnedBy(userID, id)
		if err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
		mergedEndpoint := mergeIntegrationField(currentProject.S3Endpoint, req.S3Endpoint)
		mergedAccess := mergeIntegrationField(currentProject.S3AccessKey, req.S3AccessKey)
		mergedSecret := mergeIntegrationField(currentProject.S3SecretKey, req.S3SecretKey)
		mergedBucket := mergeIntegrationField(currentProject.S3Bucket, req.S3Bucket)
		if err := s.store.UpdateProjectStorage(userID, id, mergedEndpoint, mergedAccess, mergedSecret, mergedBucket); err != nil {
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

func (s *Server) DeleteProject(c *gin.Context) {
	id := c.Param("id")
	userID := userIDFromContext(c)

	if err := s.store.DeleteProject(userID, id); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusNotFound
		} else if strings.Contains(strings.ToLower(err.Error()), "cannot delete default project") {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
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

	sig := strings.TrimSpace(c.GetHeader("x-signature"))
	hasValidHMAC := false
	if sig != "" {
		if !verifyHMACSHA256Hex(project.APISecret, rawBody, sig) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid signature"})
			return
		}
		hasValidHMAC = true
	}

	reqOrigin := requestOriginOrReferer(c)
	if !OriginMatchesAllowlist(project.AllowedOrigins, reqOrigin, hasValidHMAC) {
		c.JSON(http.StatusForbidden, gin.H{"error": "origin not allowed for this project"})
		return
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
	project, err := s.store.ProjectOwnedBy(userIDFromContext(c), req.ProjectID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	u, err := s.store.FindUserByID(userIDFromContext(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Prefer project-specific S3 credentials; fallback to user-level credentials for backward compatibility.
	s3Endpoint := strings.TrimSpace(project.S3Endpoint)
	s3Bucket := strings.TrimSpace(project.S3Bucket)
	s3Access := strings.TrimSpace(project.S3AccessKey)
	s3Secret := strings.TrimSpace(project.S3SecretKey)
	if s3Endpoint == "" || s3Bucket == "" || s3Access == "" || s3Secret == "" {
		s3Endpoint = strings.TrimSpace(u.S3Endpoint)
		s3Bucket = strings.TrimSpace(u.S3Bucket)
		s3Access = strings.TrimSpace(u.S3AccessKey)
		s3Secret = strings.TrimSpace(u.S3SecretKey)
	}
	if s3Endpoint == "" || s3Bucket == "" || s3Access == "" || s3Secret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "configure S3 storage for this project in Projects (or set legacy user-level S3 settings)"})
		return
	}
	result, err := storage.PresignUpload(c.Request.Context(), storage.PresignInput{
		Endpoint:      s3Endpoint,
		AccessKey:     s3Access,
		SecretKey:     s3Secret,
		Bucket:        s3Bucket,
		ProjectID:     req.ProjectID,
		Filename:      req.Filename,
		ExpiryMinutes: s.cfg.PresignExpiryMinutes,
	})
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

func (s *Server) ChangePassword(c *gin.Context) {
	var req changePasswordRequest
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
	if !auth.VerifyPassword(req.CurrentPassword, u.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "current password is incorrect"})
		return
	}
	nextHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.store.UpdateUserPassword(u.ID, nextHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "password updated"})
}

func (s *Server) RotateAccountAPIKey(c *gin.Context) {
	userID := userIDFromContext(c)
	nextKey, err := keys.NewAPIKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if err := s.store.UpdateUserAPIKey(userID, nextKey); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "rotated", "api_key": nextKey})
}

func (s *Server) RotateAllProjectKeys(c *gin.Context) {
	userID := userIDFromContext(c)
	projects, err := s.store.ListProjects(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rotated := 0
	for _, p := range projects {
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
		if err := s.store.RegenerateProjectKeys(userID, p.ID, pk, sk); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		rotated++
	}
	c.JSON(http.StatusOK, gin.H{"status": "rotated", "projects_rotated": rotated})
}

