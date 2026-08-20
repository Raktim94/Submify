package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/config"
)

// SubmifyCORS sets Access-Control-* using OriginAllowed (same-host tunnel-safe, env lists, LAN relax).
// POST /api/submit allows any browser Origin so embedded forms on external sites work with x-api-key.
// The public booking API (/api/v1/public/*) gets the same any-origin treatment — see
// isPublicUnauthenticatedRoute below.
func SubmifyCORS(cfg config.Config) gin.HandlerFunc {
	maxAge := int((12 * time.Hour).Seconds())
	// Credentialed dashboard + cookie auth; public submit/booking stay credentials=false below.
	corsHeaders := "Authorization, Content-Type, Cookie, X-Refresh-Token, x-api-key, x-signature"
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		path := c.Request.URL.Path

		// Public, unauthenticated routes reachable from arbitrary external websites (CORS,
		// no cookies): form submission (x-api-key) and the public booking API (an
		// unguessable event-type ID / manage_token is the access control, matching
		// docs/api.md's own description of that flow). A marketing site building its own
		// embedded booking widget needs to call this directly via fetch(), not just link
		// to /book/{id} as a plain page navigation (which never needed CORS at all).
		if isPublicUnauthenticatedRoute(path, cfg) {
			h := c.Writer.Header()
			if origin != "" {
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Vary", "Origin")
			}
			h.Set("Access-Control-Allow-Credentials", "false")
			if c.Request.Method == http.MethodOptions {
				// GET, not just POST: unlike /api/submit (POST-only), the public booking
				// API also has real GET routes (event type info, available slots) that a
				// widget built on another site needs to call.
				h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				h.Set("Access-Control-Allow-Headers", corsHeaders)
				h.Set("Access-Control-Max-Age", strconv.Itoa(maxAge))
				c.AbortWithStatus(http.StatusNoContent)
				return
			}
			c.Next()
			return
		}

		if origin == "" {
			c.Next()
			return
		}

		if !OriginAllowed(origin, c.Request, cfg) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "origin not allowed"})
			return
		}

		h := c.Writer.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Access-Control-Allow-Credentials", "true")
		h.Set("Vary", "Origin")

		if c.Request.Method == http.MethodOptions {
			h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", corsHeaders)
			h.Set("Access-Control-Max-Age", strconv.Itoa(maxAge))
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// isPublicUnauthenticatedRoute reports whether path is one of the routes
// explicitly designed to be called cross-origin from any external
// website, gated per-route by its own config flag so an operator can
// disable either surface independently.
func isPublicUnauthenticatedRoute(path string, cfg config.Config) bool {
	if cfg.CorsPublicSubmitAnyOrigin && path == "/api/submit" {
		return true
	}
	if cfg.CorsPublicBookingAnyOrigin && strings.HasPrefix(path, "/api/v1/public/") {
		return true
	}
	return false
}
