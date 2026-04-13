package keys

import (
	"crypto/rand"
	"encoding/hex"
)

// NewAPIKey returns a public key suitable for x-api-key (browser-safe).
func NewAPIKey() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "pk_live_" + hex.EncodeToString(b), nil
}

// NewAPISecret returns a secret used for HMAC and server-side verification only.
func NewAPISecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "sk_live_" + hex.EncodeToString(b), nil
}
