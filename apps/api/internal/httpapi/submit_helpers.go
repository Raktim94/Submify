package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func clientIPFromRequest(c *gin.Context) string {
	cf := strings.TrimSpace(c.GetHeader("CF-Connecting-IP"))
	if cf != "" {
		if i := strings.IndexByte(cf, ','); i >= 0 {
			cf = strings.TrimSpace(cf[:i])
		}
		return cf
	}
	return c.ClientIP()
}

func hmacSHA256Hex(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func verifyHMACSHA256Hex(secret string, body []byte, sigHex string) bool {
	sigHex = strings.TrimSpace(sigHex)
	if sigHex == "" {
		return false
	}
	want := hmacSHA256Hex(secret, body)
	wantBytes, err1 := hex.DecodeString(want)
	gotBytes, err2 := hex.DecodeString(strings.ToLower(strings.TrimSpace(sigHex)))
	if err1 != nil || err2 != nil || len(wantBytes) != len(gotBytes) {
		return false
	}
	return subtle.ConstantTimeCompare(wantBytes, gotBytes) == 1
}

// isPlausiblePublicAPIKey rejects obvious garbage before DB lookup (pk_live_* or legacy UUID).
func isPlausiblePublicAPIKey(k string) bool {
	k = strings.TrimSpace(k)
	if k == "" {
		return false
	}
	if strings.HasPrefix(k, "pk_live_") && len(k) > len("pk_live_") {
		return true
	}
	if _, err := uuid.Parse(k); err == nil {
		return true
	}
	return false
}

// requestOriginOrReferer returns Origin if set; otherwise a synthetic origin from Referer (for browsers that omit Origin).
func requestOriginOrReferer(c *gin.Context) string {
	if o := strings.TrimSpace(c.GetHeader("Origin")); o != "" {
		return o
	}
	ref := strings.TrimSpace(c.GetHeader("Referer"))
	if ref == "" {
		return ""
	}
	u, err := url.Parse(ref)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

// OriginMatchesAllowlist enforces optional per-project browser Origin / Referer (full origin URL, e.g. https://app.example.com).
func OriginMatchesAllowlist(allowed []string, requestOrigin string) bool {
	if len(allowed) == 0 {
		return true
	}
	if strings.TrimSpace(requestOrigin) == "" {
		return true
	}
	ro := strings.TrimSpace(requestOrigin)
	for _, a := range allowed {
		if strings.EqualFold(strings.TrimSpace(a), ro) {
			return true
		}
	}
	return false
}
