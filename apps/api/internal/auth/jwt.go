package auth

import (
	"errors"
	"time"

	"github.com/google/uuid"
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
	JTI    string `json:"jti"`
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
	access, _, err := m.generate(userID, email, "access", time.Duration(m.accessTokenTTLMinutes)*time.Minute)
	if err != nil {
		return "", "", err
	}
	refresh, _, err := m.generate(userID, email, "refresh", time.Duration(m.refreshTokenTTLHours)*time.Hour)
	if err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

func (m *TokenManager) GeneratePairWithClaims(userID, email string) (string, *Claims, string, *Claims, error) {
	access, accessClaims, err := m.generate(userID, email, "access", time.Duration(m.accessTokenTTLMinutes)*time.Minute)
	if err != nil {
		return "", nil, "", nil, err
	}
	refresh, refreshClaims, err := m.generate(userID, email, "refresh", time.Duration(m.refreshTokenTTLHours)*time.Hour)
	if err != nil {
		return "", nil, "", nil, err
	}
	return access, accessClaims, refresh, refreshClaims, nil
}

func (m *TokenManager) generate(userID, email, tokenType string, ttl time.Duration) (string, *Claims, error) {
	now := time.Now()
	jti := uuid.NewString()
	claims := Claims{
		UserID: userID,
		Email:  email,
		Type:   tokenType,
		JTI:    jti,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        jti,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.secret)
	if err != nil {
		return "", nil, err
	}
	return signed, &claims, nil
}

func (m *TokenManager) Parse(token string, expectedType string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
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
	if claims.JTI == "" {
		claims.JTI = claims.ID
	}
	if claims.JTI == "" {
		return nil, errors.New("missing token id")
	}
	return claims, nil
}
