package httpapi

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	accessCookieName  = "submify_access_token"
	refreshCookieName = "submify_refresh_token"
)

func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		// JSON API only — no inline scripts; tighten XSS depth vs generic 'unsafe-inline'.
		c.Header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Next()
	}
}

func (s *Server) SetupGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		ok, err := s.store.HasAnyUser()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if !ok {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "no accounts yet; register first"})
			return
		}
		c.Next()
	}
}

func accessTokenFromRequest(c *gin.Context) string {
	if authHeader := strings.TrimSpace(c.GetHeader("Authorization")); strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}
	if cookie, err := c.Request.Cookie(accessCookieName); err == nil && strings.TrimSpace(cookie.Value) != "" {
		return strings.TrimSpace(cookie.Value)
	}
	return ""
}

func (s *Server) AuthGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := accessTokenFromRequest(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}
		claims, err := s.tokens.Parse(token, "access")
		if err != nil {
			log.Printf("auth reject: remote=%s path=%s reason=%v", c.ClientIP(), c.Request.URL.Path, err)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		// Every authenticated request resolves its organization here, once,
		// so every downstream handler scopes by organization_id rather than
		// user_id — see docs/decisions/0001-workspaces-layer-approach.md.
		// A user with no organization is an invariant violation (every
		// account is created together with its organization membership),
		// so this fails closed with 500 rather than silently proceeding
		// unscoped.
		org, err := s.store.OrganizationForUser(claims.UserID)
		if err != nil {
			log.Printf("auth: no organization for user=%s reason=%v", claims.UserID, err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "account is not attached to an organization"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("email", claims.Email)
		c.Set("organization_id", org.ID)
		c.Next()
	}
}

func userIDFromContext(c *gin.Context) string {
	v, _ := c.Get("user_id")
	id, _ := v.(string)
	return id
}

func organizationIDFromContext(c *gin.Context) string {
	v, _ := c.Get("organization_id")
	id, _ := v.(string)
	return id
}

// AdminGuard restricts a route to the instance's admin account (the first user that ever registered).
// It must run after AuthGuard so user_id is already set in the context.
func (s *Server) AdminGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		u, err := s.store.FindUserByID(userIDFromContext(c))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if !u.IsAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access required"})
			return
		}
		c.Next()
	}
}
