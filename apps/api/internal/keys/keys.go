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

// NewManageToken returns an unguessable token for a booking's secure
// reschedule/cancel link — this must never be a predictable ID (see
// docs/decisions/0005-calendar-booking-architecture.md's neighbor
// requirement in the master brief: no exposing predictable booking IDs).
func NewManageToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "bkg_" + hex.EncodeToString(b), nil
}

// portalPasswordAlphabet excludes visually ambiguous characters (0/o, 1/l/i) so the
// generated portal password is easy to read aloud and share. Its length (32) divides
// 256 evenly, so the modulo mapping below is unbiased.
const portalPasswordAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"

// NewPortalPassword returns a human-shareable random password for a project's client
// portal. It is shown to the owner exactly once (only its hash is stored).
func NewPortalPassword() (string, error) {
	const length = 16
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, length)
	for i, v := range b {
		out[i] = portalPasswordAlphabet[int(v)%len(portalPasswordAlphabet)]
	}
	return string(out), nil
}
