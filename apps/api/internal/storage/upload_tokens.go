package storage

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// UploadToken is a one-time, short-lived permission slip to PUT exactly one
// object to the local backend — the local-storage equivalent of an S3
// presigned PUT URL. In-memory by design (matches this codebase's existing
// in-process rate limiter — see internal/httpapi/ratelimit.go — and a lost
// token on restart just means the client re-requests a presign, same as a
// timed-out S3 presigned URL).
type UploadToken struct {
	ObjectKey string
	MaxBytes  int64
	ExpiresAt time.Time
}

type UploadTokenStore struct {
	mu     sync.Mutex
	tokens map[string]UploadToken
}

func NewUploadTokenStore() *UploadTokenStore {
	return &UploadTokenStore{tokens: make(map[string]UploadToken)}
}

// Issue creates a new token for objectKey, valid for ttl. Also sweeps
// expired entries so the map can't grow unbounded between issues.
func (s *UploadTokenStore) Issue(objectKey string, maxBytes int64, ttl time.Duration) (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)

	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for t, entry := range s.tokens {
		if now.After(entry.ExpiresAt) {
			delete(s.tokens, t)
		}
	}
	s.tokens[token] = UploadToken{ObjectKey: objectKey, MaxBytes: maxBytes, ExpiresAt: now.Add(ttl)}
	return token, nil
}

// Consume validates and removes a token — it can only ever be used once,
// same as a presigned S3 PUT URL is only good for one successful upload in
// this codebase's usage pattern.
func (s *UploadTokenStore) Consume(token string) (UploadToken, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.tokens[token]
	if !ok {
		return UploadToken{}, false
	}
	delete(s.tokens, token)
	if time.Now().After(entry.ExpiresAt) {
		return UploadToken{}, false
	}
	return entry, true
}
