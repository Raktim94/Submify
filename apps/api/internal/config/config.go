package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                         string
	DatabaseURL                  string
	JWTSecret                    string
	AllowedOrigins               []string
	// CorsRelaxPrivateNetworks allows browser Origins on loopback, RFC1918, and link-local IPs
	// when not explicitly listed in AllowedOrigins (self-hosted LAN access).
	CorsRelaxPrivateNetworks bool
	// CorsOriginHostSuffixes allows https?://*.suffix and https?://suffix (e.g. nodedr.com for api.nodedr.com).
	CorsOriginHostSuffixes []string
	// CorsAllowSameHostOrigin allows any Origin whose host:port matches this request (after X-Forwarded-*).
	// Enables Cloudflare Tunnel / CasaOS-style single public URL without listing ALLOWED_ORIGINS per hostname.
	CorsAllowSameHostOrigin bool
	// CorsPublicSubmitAnyOrigin allows any browser Origin for POST /api/submit (uses x-api-key, not cookies).
	CorsPublicSubmitAnyOrigin bool
	TrustedProxies            []string
	UploadMaxSizeBytes           int64
	AllowedMIMETypes             map[string]struct{}
	PresignExpiryMinutes         int
	RefreshTokenTTLHours         int
	AccessTokenTTLMinutes        int
	RateLimitSensitivePublicRPM  int
	RateLimitSubmitIPRPM         int
	RateLimitSubmitKeyRPM        int
	RateLimitAuthedUserRPM       int
	// SubmitMaxBodyBytes caps JSON body size for POST /api/submit.
	SubmitMaxBodyBytes int64
	AuthCookieSecure   bool
	AuthCookieDomain   string
	AuthCookieSameSite string
}

func Load() Config {
	trusted := splitCSV(getEnv("TRUSTED_PROXIES", "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"))
	if len(trusted) == 0 {
		trusted = []string{"127.0.0.1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"}
	}
	// Defaults match docker-compose.yml when env vars are unset (self-host / tunnel / nginx in front).
	cfg := Config{
		Port: getEnv("PORT", "8080"),
		DatabaseURL:                 getEnv("DATABASE_URL", "postgres://submify:submify@db:5432/submify?sslmode=disable"),
		JWTSecret:                   getJWTSecret(),
		AllowedOrigins:              splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:2512,http://127.0.0.1:2512")),
		CorsRelaxPrivateNetworks:    getEnvBool("CORS_RELAX_PRIVATE_NETWORKS", true),
		CorsOriginHostSuffixes:      splitCSV(getEnv("CORS_ORIGIN_HOST_SUFFIXES", "")),
		CorsAllowSameHostOrigin:     getEnvBool("CORS_ALLOW_SAME_HOST_ORIGIN", true),
		CorsPublicSubmitAnyOrigin:   getEnvBool("CORS_PUBLIC_SUBMIT_ANY_ORIGIN", true),
		TrustedProxies:              trusted,
		UploadMaxSizeBytes:          int64(getEnvInt("UPLOAD_MAX_SIZE_BYTES", 25*1024*1024)),
		AllowedMIMETypes:            toMIMEMap(splitCSV(getEnv("UPLOAD_ALLOWED_MIME", "image/png,image/jpeg,application/pdf,text/plain"))),
		PresignExpiryMinutes:        getEnvInt("PRESIGN_EXPIRY_MINUTES", 10),
		RefreshTokenTTLHours:        getEnvInt("REFRESH_TOKEN_TTL_HOURS", 168),
		AccessTokenTTLMinutes:       getEnvInt("ACCESS_TOKEN_TTL_MINUTES", 30),
		RateLimitSensitivePublicRPM: getEnvInt("RATE_LIMIT_SENSITIVE_PUBLIC_RPM", 25),
		RateLimitSubmitIPRPM:        getEnvInt("RATE_LIMIT_SUBMIT_IP_RPM", 90),
		RateLimitSubmitKeyRPM:       getEnvInt("RATE_LIMIT_SUBMIT_KEY_RPM", 180),
		RateLimitAuthedUserRPM:      getEnvInt("RATE_LIMIT_AUTH_USER_RPM", 600),
		SubmitMaxBodyBytes:          int64(getEnvInt("SUBMIT_MAX_BODY_BYTES", 1024*1024)),
		// Default false so HttpOnly cookies work on plain HTTP (e.g. local Docker on :2512). Set AUTH_COOKIE_SECURE=true behind HTTPS.
		AuthCookieSecure:            getEnvBool("AUTH_COOKIE_SECURE", false),
		AuthCookieDomain:            strings.TrimSpace(getEnv("AUTH_COOKIE_DOMAIN", "")),
		AuthCookieSameSite:          strings.ToLower(strings.TrimSpace(getEnv("AUTH_COOKIE_SAMESITE", "lax"))),
	}
	switch cfg.AuthCookieSameSite {
	case "strict", "lax", "none":
	default:
		cfg.AuthCookieSameSite = "lax"
	}
	return cfg
}

// Validate fails fast on unsafe settings in production-like environments.
func Validate(cfg Config) error {
	enforce := strings.EqualFold(strings.TrimSpace(os.Getenv("GIN_MODE")), "release") ||
		getEnvBool("SUBMIFY_ENFORCE_SECRETS", false)
	if !enforce {
		return nil
	}
	secret := strings.TrimSpace(cfg.JWTSecret)
	if len(secret) < 32 {
		return fmt.Errorf("JWT_SECRET must be set to a random string of at least 32 characters (GIN_MODE=release or SUBMIFY_ENFORCE_SECRETS=true)")
	}
	weak := []string{
		"change-this-in-production",
		"changeme",
		"secret",
		"submify",
	}
	lower := strings.ToLower(secret)
	for _, w := range weak {
		if lower == w {
			return fmt.Errorf("JWT_SECRET must not use a known weak default value")
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvBool(key string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	return v == "1" || v == "true" || v == "yes"
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func toMIMEMap(values []string) map[string]struct{} {
	out := make(map[string]struct{}, len(values))
	for _, v := range values {
		out[v] = struct{}{}
	}
	return out
}

func getJWTSecret() string {
	if explicit := strings.TrimSpace(os.Getenv("JWT_SECRET")); explicit != "" {
		return explicit
	}
	// Random fallback prevents predictable token signing keys in accidental default deployments.
	// It is intentionally ephemeral; operators should set JWT_SECRET explicitly.
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "ephemeral-secret-not-for-production"
	}
	return hex.EncodeToString(b)
}
