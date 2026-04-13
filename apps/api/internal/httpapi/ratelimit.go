package httpapi

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

// KeyedRateLimiter applies a token bucket per arbitrary key (IP, user id, API key, …).
// Maps grow with unique keys; suitable for self-hosted modest traffic.
type KeyedRateLimiter struct {
	mu    sync.RWMutex
	keys  map[string]*rate.Limiter
	limit rate.Limit
	burst int
}

func NewKeyedRateLimiter(requestsPerMinute int, burst int) *KeyedRateLimiter {
	if requestsPerMinute < 1 {
		requestsPerMinute = 1
	}
	if burst < 1 {
		burst = 1
	}
	return &KeyedRateLimiter{
		keys:  make(map[string]*rate.Limiter),
		limit: rate.Limit(float64(requestsPerMinute) / 60.0),
		burst: burst,
	}
}

func (k *KeyedRateLimiter) Allow(key string) bool {
	if key == "" {
		key = "unknown"
	}
	k.mu.RLock()
	limiter, ok := k.keys[key]
	k.mu.RUnlock()
	if ok {
		return limiter.Allow()
	}
	k.mu.Lock()
	defer k.mu.Unlock()
	if limiter, ok = k.keys[key]; ok {
		return limiter.Allow()
	}
	limiter = rate.NewLimiter(k.limit, k.burst)
	k.keys[key] = limiter
	return limiter.Allow()
}

func clientIPKey(c *gin.Context) string {
	return c.ClientIP()
}

func userIDKey(c *gin.Context) string {
	v, ok := c.Get("user_id")
	if !ok {
		return ""
	}
	id, _ := v.(string)
	return id
}

func skipOPTIONS(c *gin.Context) bool {
	return c.Request.Method == http.MethodOptions
}

// KeyedRateLimitMiddleware limits by keyFunc (e.g. IP). message shown on 429.
func KeyedRateLimitMiddleware(limiter *KeyedRateLimiter, keyFn func(*gin.Context) string, message string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if skipOPTIONS(c) {
			c.Next()
			return
		}
		if !limiter.Allow(keyFn(c)) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": message})
			return
		}
		c.Next()
	}
}

func (s *Server) SubmitRateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if skipOPTIONS(c) {
			c.Next()
			return
		}
		ip := c.ClientIP()
		if !s.submitLimitIP.Allow(ip) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded (submit, per IP)"})
			return
		}
		key := c.Param("project_key")
		if key != "" && !s.submitLimitKey.Allow("key:"+key) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded (submit, per API key)"})
			return
		}
		c.Next()
	}
}

func (s *Server) AuthedUserRateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if skipOPTIONS(c) {
			c.Next()
			return
		}
		uid := userIDKey(c)
		if uid == "" {
			c.Next()
			return
		}
		if !s.authedUserLimiter.Allow("u:" + uid) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded (authenticated user)"})
			return
		}
		c.Next()
	}
}
