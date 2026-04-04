package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type TokenManager struct {
	secret                []byte
	accessTokenTTLMinutes int
	refreshTokenTTLHours  int
}

type Claims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	Type   string `json:"type"`
	jwt.RegisteredClaims
}

func NewTokenManager(secret string, accessTokenTTLMinutes, refreshTokenTTLHours int) *TokenManager {
	return &TokenManager{
		secret:                []byte(secret),
		accessTokenTTLMinutes: accessTokenTTLMinutes,
		refreshTokenTTLHours:  refreshTokenTTLHours,
	}
}

func (m *TokenManager) GeneratePair(userID, email string) (string, string, error) {
	access, err := m.generate(userID, email, "access", time.Duration(m.accessTokenTTLMinutes)*time.Minute)
	if err != nil {
		return "", "", err
	}
	refresh, err := m.generate(userID, email, "refresh", time.Duration(m.refreshTokenTTLHours)*time.Hour)
	if err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

func (m *TokenManager) generate(userID, email, tokenType string, ttl time.Duration) (string, error) {
	claims := Claims{
		UserID: userID,
		Email:  email,
		Type:   tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *TokenManager) Parse(token string, expectedType string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(_ *jwt.Token) (interface{}, error) {
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	if claims.Type != expectedType {
		return nil, errors.New("invalid token type")
	}
	return claims, nil
}
