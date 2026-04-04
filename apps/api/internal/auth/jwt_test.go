package auth

import "testing"

func TestTokenPair(t *testing.T) {
	m := NewTokenManager("test-secret", 5, 1)
	access, refresh, err := m.GeneratePair("user-1", "a@b.com")
	if err != nil {
		t.Fatalf("generate pair error: %v", err)
	}
	if _, err := m.Parse(access, "access"); err != nil {
		t.Fatalf("parse access error: %v", err)
	}
	if _, err := m.Parse(refresh, "refresh"); err != nil {
		t.Fatalf("parse refresh error: %v", err)
	}
}
