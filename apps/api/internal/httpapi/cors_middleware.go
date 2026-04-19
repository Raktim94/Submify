package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/config"
)

// SubmifyCORS sets Access-Control-* using OriginAllowed (same-host tunnel-safe, env lists, LAN relax).
// POST /api/submit allows any browser Origin so embedded forms on external sites work with x-api-key.
func SubmifyCORS(cfg config.Config) gin.HandlerFunc {
	maxAge := int((12 * time.Hour).Seconds())
	// Credentialed dashboard + cookie auth; public submit stays credentials=false below.
	corsHeaders := "Authorization, Content-Type, Cookie, X-Refresh-Token, x-api-key, x-signature"
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		path := c.Request.URL.Path

		// Public JSON submit from arbitrary websites (CORS + x-api-key). No cookies; credentials off.
		if cfg.CorsPublicSubmitAnyOrigin && path == "/api/submit" {
			h := c.Writer.Header()
			if origin != "" {
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Vary", "Origin")
			}
			h.Set("Access-Control-Allow-Credentials", "false")
			if c.Request.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "POST, OPTIONS")
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
