package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"strings"

	"github.com/gin-gonic/gin"
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
