package httpapi

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/auth"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/keys"
)

const portalCookieName = "submify_portal_token"

// projectWithSecret embeds a Project and adds a one-time plaintext portal password.
// Only the hash is ever stored, so the password is surfaced exactly once — on create,
// or when the owner (re)generates it.
type projectWithSecret struct {
	db.Project
	PortalPassword string `json:"portal_password,omitempty"`
}

type portalLoginRequest struct {
	Slug     string `json:"slug" binding:"required"`
	Password string `json:"password"`
}

func randomSlugSuffix() (string, error) {
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ensureUniquePortalSlug returns a slug based on `base` that is neither reserved nor
// already used by another project.
func (s *Server) ensureUniquePortalSlug(base, projectID string) (string, error) {
	base = strings.Trim(base, "-")
	if base == "" {
		base = "project"
	}
	if len(base) > 34 {
		base = strings.Trim(base[:34], "-")
	}
	candidate := base
	for i := 0; i < 50; i++ {
		_, reserved := reservedPortalSlugs[candidate]
		taken := false
		if !reserved {
			var err error
			taken, err = s.store.PortalSlugTaken(candidate, projectID)
			if err != nil {
				return "", err
			}
		}
		if !reserved && !taken {
			return candidate, nil
		}
		suffix, err := randomSlugSuffix()
		if err != nil {
			return "", err
		}
		candidate = base + "-" + suffix
	}
	return "", errors.New("could not allocate a unique portal slug")
}

// assignDefaultPortal provisions a slug + one-time password for a freshly created project.
func (s *Server) assignDefaultPortal(orgID string, project db.Project) (slug, password string, err error) {
	slug, err = s.ensureUniquePortalSlug(slugify(project.Name), project.ID)
	if err != nil {
		return "", "", err
	}
	password, err = keys.NewPortalPassword()
	if err != nil {
		return "", "", err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return "", "", err
	}
	if err := s.store.UpdateProjectPortalSlug(orgID, project.ID, slug); err != nil {
		return "", "", err
	}
	if err := s.store.UpdateProjectPortalPassword(orgID, project.ID, hash); err != nil {
		return "", "", err
	}
	return slug, password, nil
}

// portalProjectKey rate-limits portal reads per project (set by PortalGuard), falling
// back to client IP before the guard has run.
func portalProjectKey(c *gin.Context) string {
	if pid := c.GetString("portal_project_id"); pid != "" {
		return "portal:" + pid
	}
	return "portal-ip:" + c.ClientIP()
}

// portalTokenFromRequest reads the portal session strictly from the HttpOnly cookie.
// The token is never exposed to JavaScript or accepted from a header, so an XSS bug on
// the portal page cannot exfiltrate or replay a session.
func portalTokenFromRequest(c *gin.Context) string {
	if cookie, err := c.Request.Cookie(portalCookieName); err == nil && strings.TrimSpace(cookie.Value) != "" {
		return strings.TrimSpace(cookie.Value)
	}
	return ""
}

func (s *Server) setPortalCookie(c *gin.Context, token string) {
	sameSite := s.cookieSameSite()
	c.SetSameSite(sameSite)
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     portalCookieName,
		Value:    token,
		Path:     "/api/v1/portal",
		HttpOnly: true,
		Secure:   s.cfg.AuthCookieSecure,
		Domain:   s.cfg.AuthCookieDomain,
		SameSite: sameSite,
	})
}

func (s *Server) clearPortalCookie(c *gin.Context) {
	sameSite := s.cookieSameSite()
	c.SetSameSite(sameSite)
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     portalCookieName,
		Value:    "",
		Path:     "/api/v1/portal",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   s.cfg.AuthCookieSecure,
		Domain:   s.cfg.AuthCookieDomain,
		SameSite: sameSite,
	})
}

// ownerIDFromSession returns the account user id if a valid dashboard access token is
// present on the request, or "" otherwise. Used to let a signed-in owner open their own
// project portal without the portal password.
func (s *Server) ownerIDFromSession(c *gin.Context) string {
	token := accessTokenFromRequest(c)
	if token == "" {
		return ""
	}
	claims, err := s.tokens.Parse(token, "access")
	if err != nil {
		return ""
	}
	return claims.UserID
}

func (s *Server) issuePortalSession(c *gin.Context, project db.Project) {
	ttl := time.Duration(s.cfg.PortalTokenTTLHours) * time.Hour
	if ttl <= 0 {
		ttl = 12 * time.Hour
	}
	token, _, err := s.tokens.GeneratePortalToken(project.ID, ttl)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.setPortalCookie(c, token)
	// The token lives only in the HttpOnly cookie — deliberately not returned in the body.
	c.JSON(http.StatusOK, gin.H{
		"ok":           true,
		"project_name": project.Name,
		"portal_slug":  project.PortalSlug,
	})
}

// PortalGuard authorizes read-only portal requests using a project-scoped portal token.
func (s *Server) PortalGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := portalTokenFromRequest(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "portal sign-in required"})
			return
		}
		claims, err := s.tokens.Parse(token, "portal")
		if err != nil || strings.TrimSpace(claims.ProjectID) == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "portal session expired; sign in again"})
			return
		}
		project, err := s.store.FindProjectByID(claims.ProjectID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if !project.PortalEnabled {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "this portal is disabled"})
			return
		}
		// Submissions (and, as of the portal calendar, bookings) are private
		// data — never let a proxy or the browser cache them.
		c.Header("Cache-Control", "no-store")
		c.Set("portal_project_id", project.ID)
		c.Set("portal_project_name", project.Name)
		// Bookings/event types are organization-scoped, not project-scoped
		// (no project_id column exists on either table) — resolve the
		// portal session's organization once here so calendar handlers can
		// scope their queries correctly. See
		// docs/decisions/0010-portal-calendar-read-only.md.
		c.Set("portal_organization_id", project.OrganizationID)
		c.Next()
	}
}

// PortalLookup (public) reports whether /<slug> resolves to an accessible portal and,
// if so, its display name and whether a password is required.
func (s *Server) PortalLookup(c *gin.Context) {
	slug := strings.ToLower(strings.TrimSpace(c.Query("slug")))
	if slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing slug"})
		return
	}
	project, err := s.store.FindProjectByPortalSlug(slug)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "portal not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ownerAccess := false
	if ownerID := s.ownerIDFromSession(c); ownerID != "" && ownerID == project.UserID {
		ownerAccess = true
	}
	passwordActive := project.PortalEnabled && strings.TrimSpace(project.PortalPasswordHash) != ""
	if !passwordActive && !ownerAccess {
		c.JSON(http.StatusNotFound, gin.H{"error": "portal not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"exists":            true,
		"project_name":      project.Name,
		"owner_access":      ownerAccess,
		"password_required": passwordActive && !ownerAccess,
	})
}

// PortalLogin (public) grants a read-only session for one project: via the owner's
// dashboard session (no password), or the correct portal password.
func (s *Server) PortalLogin(c *gin.Context) {
	var req portalLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	// Per-project throttle (on top of the per-IP sensitive limiter) so a weak custom
	// password cannot be brute-forced from many IPs against a single portal.
	if slug != "" && !s.portalLoginLimiter.Allow("portal-login:"+slug) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many attempts for this portal; try again shortly"})
		return
	}
	project, err := s.store.FindProjectByPortalSlug(slug)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "portal not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Owner shortcut: a signed-in account owner reaches their own project portal freely.
	if ownerID := s.ownerIDFromSession(c); ownerID != "" && ownerID == project.UserID {
		s.issuePortalSession(c, project)
		return
	}

	if !project.PortalEnabled || strings.TrimSpace(project.PortalPasswordHash) == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "this portal is not available"})
		return
	}
	if strings.TrimSpace(req.Password) == "" || !auth.VerifyPassword(req.Password, project.PortalPasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "incorrect password"})
		return
	}
	s.issuePortalSession(c, project)
}

func (s *Server) PortalLogout(c *gin.Context) {
	s.clearPortalCookie(c)
	c.JSON(http.StatusOK, gin.H{"status": "logged out"})
}

func (s *Server) PortalInfo(c *gin.Context) {
	pid := c.GetString("portal_project_id")
	count, err := s.store.CountSubmissions(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"project_name":     c.GetString("portal_project_name"),
		"submission_count": count,
	})
}

func (s *Server) PortalSubmissions(c *gin.Context) {
	pid := c.GetString("portal_project_id")
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
	rows, err := s.store.ListSubmissions(pid, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"submissions": rows, "limit": limit, "offset": offset})
}

func (s *Server) PortalExport(c *gin.Context) {
	pid := c.GetString("portal_project_id")
	rows, err := s.store.ListSubmissions(pid, 5000, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	format := strings.ToLower(c.DefaultQuery("format", "xlsx"))
	if format == "pdf" {
		out, err := writePDF(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Header("Content-Disposition", "attachment; filename=submissions.pdf")
		c.Data(http.StatusOK, "application/pdf", out)
		return
	}
	out, err := writeExcel(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Content-Disposition", "attachment; filename=submissions.xlsx")
	c.Data(http.StatusOK, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out)
}
