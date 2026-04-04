package httpapi

import (
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type IPRateLimiter struct {
	ips map[string]*rate.Limiter
	mu  sync.RWMutex
	r   rate.Limit
	b   int
}

func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	return &IPRateLimiter{ips: map[string]*rate.Limiter{}, r: r, b: b}
}

func (i *IPRateLimiter) getLimiter(ip string) *rate.Limiter {
	i.mu.RLock()
	limiter, exists := i.ips[ip]
	i.mu.RUnlock()
	if exists {
		return limiter
	}
	i.mu.Lock()
	defer i.mu.Unlock()
	limiter = rate.NewLimiter(i.r, i.b)
	i.ips[ip] = limiter
	return limiter
}

func (s *Server) RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !s.limiter.getLimiter(ip).Allow() {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded (10 req/min)"})
			return
		}
		c.Next()
	}
}

func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'")
		c.Next()
	}
}

func (s *Server) SetupGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		complete, err := s.store.BootstrapComplete()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if !complete {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "system setup required"})
			return
		}
		c.Next()
	}
}

func (s *Server) AuthGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}
		token := strings.TrimSpace(header[7:])
		claims, err := s.tokens.Parse(token, "access")
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("email", claims.Email)
		c.Next()
	}
}

func userIDFromContext(c *gin.Context) string {
	v, _ := c.Get("user_id")
	id, _ := v.(string)
	return id
}
