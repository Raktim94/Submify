package auth

import "testing"

func TestHashAndVerify(t *testing.T) {
	hash, err := HashPassword("super-secret-password")
	if err != nil {
		t.Fatalf("hash error: %v", err)
	}
	if !VerifyPassword("super-secret-password", hash) {
		t.Fatalf("expected password verification to succeed")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatalf("expected password verification to fail")
	}
}
