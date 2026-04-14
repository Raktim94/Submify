package config

import (
	"os"
	"strconv"
	"strings"
	"time"
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
	AppVersion                   string
	GitHubRepo                   string
	// GitHubToken optional PAT for higher API rate limits (private repos need repo scope).
	GitHubToken                  string
	UpdateCheckInterval          time.Duration
	AllowUpdateTrigger           bool
	UpdateCommand                string
	UpdateTimeoutMinutes         int
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
}

func Load() Config {
	trusted := splitCSV(getEnv("TRUSTED_PROXIES", "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"))
	if len(trusted) == 0 {
		trusted = []string{"127.0.0.1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"}
	}
	return Config{
		Port: getEnv("PORT", "8080"),
		DatabaseURL:                 getEnv("DATABASE_URL", "postgres://submify:submify@db:5432/submify?sslmode=disable"),
		JWTSecret:                   getEnv("JWT_SECRET", "change-this-in-production"),
		AllowedOrigins:              splitCSV(getEnv("ALLOWED_ORIGINS", "http://localhost:2512,http://127.0.0.1:2512")),
		CorsRelaxPrivateNetworks:    getEnvBool("CORS_RELAX_PRIVATE_NETWORKS", true),
		CorsOriginHostSuffixes:      splitCSV(getEnv("CORS_ORIGIN_HOST_SUFFIXES", "")),
		CorsAllowSameHostOrigin:     getEnvBool("CORS_ALLOW_SAME_HOST_ORIGIN", true),
		CorsPublicSubmitAnyOrigin:   getEnvBool("CORS_PUBLIC_SUBMIT_ANY_ORIGIN", true),
		TrustedProxies:              trusted,
		AppVersion:                  getEnv("APP_VERSION", "0.1.0"),
		GitHubRepo:                  getEnv("GITHUB_REPO", "Raktim94/Submify"),
		GitHubToken:                 getEnv("GITHUB_TOKEN", ""),
		UpdateCheckInterval:         time.Duration(getEnvInt("UPDATE_CHECK_MINUTES", 360)) * time.Minute,
		AllowUpdateTrigger:          getEnvBool("ALLOW_UPDATE_TRIGGER", false),
		UpdateCommand:               getEnv("UPDATE_COMMAND", "cd /stack && git pull && docker compose pull && docker compose up --build -d && chmod +x scripts/prune-docker.sh && ./scripts/prune-docker.sh && (docker compose logs --tail 3000 -f api > /tmp/submify-update-api.log 2>&1 &)"),
		UpdateTimeoutMinutes:        getEnvInt("UPDATE_TIMEOUT_MINUTES", 30),
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
	}
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
