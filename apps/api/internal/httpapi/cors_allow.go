package httpapi

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/nodedr/submify/apps/api/internal/config"
)

// OriginAllowed reports whether the browser Origin header is permitted for this request.
// Order: explicit ALLOWED_ORIGINS → host suffixes → same-host as request (tunnel / reverse proxy)
// → optional private-LAN relaxation.
func OriginAllowed(origin string, r *http.Request, cfg config.Config) bool {
	if origin == "" {
		return true
	}
	for _, o := range cfg.AllowedOrigins {
		if o == origin {
			return true
		}
	}
	if originMatchesHostSuffix(origin, cfg.CorsOriginHostSuffixes) {
		return true
	}
	if cfg.CorsAllowSameHostOrigin && originMatchesRequestHost(origin, r) {
		return true
	}
	if cfg.CorsAllowSameHostOrigin && originMatchesRequestHostnameOnly(origin, r) {
		return true
	}
	if !cfg.CorsRelaxPrivateNetworks {
		return false
	}
	return isRelaxedHTTPOrigin(origin)
}

// originMatchesRequestHost is true when Origin's host:port equals the public host the client used
// (Host / X-Forwarded-Host + X-Forwarded-Proto), e.g. Cloudflare Tunnel or nginx in front of the API.
func originMatchesRequestHost(origin string, r *http.Request) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	oh := strings.ToLower(u.Hostname())
	op := u.Port()
	if op == "" {
		if u.Scheme == "https" {
			op = "443"
		} else {
			op = "80"
		}
	}

	raw := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if i := strings.Index(raw, ","); i >= 0 {
		raw = strings.TrimSpace(raw[:i])
	}
	if raw == "" {
		raw = r.Host
	}
	rh, rp, err := net.SplitHostPort(raw)
	if err != nil {
		rh = strings.ToLower(strings.TrimSpace(raw))
		rp = ""
	} else {
		rh = strings.ToLower(rh)
	}
	if rp == "" {
		proto := forwardedProto(r)
		if proto == "https" {
			rp = "443"
		} else {
			rp = "80"
		}
	}

	return oh == rh && op == rp
}

// originMatchesRequestHostnameOnly allows when the Origin hostname matches any public host
// the proxy forwarded (Host, X-Forwarded-Host, Forwarded), ignoring port. Helps Cloudflare Tunnel
// and chains where edge :443 maps to origin :2512 but Host headers omit or differ on port.
func originMatchesRequestHostnameOnly(origin string, r *http.Request) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	oh := strings.ToLower(u.Hostname())
	if oh == "" {
		return false
	}
	for _, h := range collectRequestHostnames(r) {
		if h == oh {
			return true
		}
	}
	return false
}

// collectRequestHostnames returns lowercase hostnames from Host, X-Forwarded-Host, Forwarded, X-Original-Host.
func collectRequestHostnames(r *http.Request) []string {
	seen := make(map[string]struct{})
	var out []string
	add := func(raw string) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return
		}
		host, _, err := net.SplitHostPort(raw)
		if err != nil {
			host = raw
		}
		host = strings.ToLower(strings.TrimSpace(host))
		if host == "" {
			return
		}
		if _, ok := seen[host]; ok {
			return
		}
		seen[host] = struct{}{}
		out = append(out, host)
	}

	add(r.Host)

	for _, part := range strings.Split(r.Header.Get("X-Forwarded-Host"), ",") {
		add(strings.TrimSpace(part))
	}

	for _, h := range hostsFromForwardedHeader(r.Header.Get("Forwarded")) {
		add(h)
	}

	add(r.Header.Get("X-Original-Host"))

	return out
}

func hostsFromForwardedHeader(forwarded string) []string {
	if forwarded == "" {
		return nil
	}
	var hosts []string
	for _, segment := range strings.Split(forwarded, ",") {
		segment = strings.TrimSpace(segment)
		for _, kv := range strings.Split(segment, ";") {
			kv = strings.TrimSpace(kv)
			low := strings.ToLower(kv)
			if !strings.HasPrefix(low, "host=") {
				continue
			}
			v := strings.TrimSpace(kv[5:])
			v = strings.Trim(v, `"`)
			if v != "" {
				hosts = append(hosts, v)
			}
		}
	}
	return hosts
}

func forwardedProto(r *http.Request) string {
	p := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")))
	switch p {
	case "https", "http":
		return p
	}
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

// originMatchesHostSuffix allows https://api.example.com when suffix is "example.com".
func originMatchesHostSuffix(origin string, suffixes []string) bool {
	if len(suffixes) == 0 {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, suf := range suffixes {
		suf = strings.ToLower(strings.TrimSpace(suf))
		if suf == "" {
			continue
		}
		if host == suf {
			return true
		}
		if strings.HasSuffix(host, "."+suf) {
			return true
		}
	}
	return false
}

func isRelaxedHTTPOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	if ip != nil {
		return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
	}
	if strings.HasSuffix(host, ".local") {
		return true
	}
	return false
}
