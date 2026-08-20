package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/config"
)

func newCORSTestRouter(cfg config.Config) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(SubmifyCORS(cfg))
	r.Any("/*path", func(c *gin.Context) { c.Status(http.StatusOK) })
	return r
}

// restrictiveCfg has no allowlisted/relaxed origins at all — any request
// this test suite finds "allowed" earns that specifically from one of the
// public-route carve-outs under test, not from some other permissive
// default sneaking the result in.
func restrictiveCfg() config.Config {
	return config.Config{
		AllowedOrigins:             nil,
		CorsRelaxPrivateNetworks:   false,
		CorsAllowSameHostOrigin:    false,
		CorsOriginHostSuffixes:     nil,
		CorsPublicSubmitAnyOrigin:  true,
		CorsPublicBookingAnyOrigin: true,
	}
}

// TestSubmifyCORS_PublicBooking_AnyOriginAllowed proves the actual fix: an
// arbitrary external website's Origin — one that matches none of
// AllowedOrigins/host-suffix/same-host/relaxed-LAN — must still be allowed
// to call the public booking API cross-origin, the same way /api/submit
// already worked. Before this fix, only /api/submit had this carve-out.
func TestSubmifyCORS_PublicBooking_AnyOriginAllowed(t *testing.T) {
	r := newCORSTestRouter(restrictiveCfg())

	paths := []string{
		"/api/v1/public/event-types/11111111-1111-1111-1111-111111111111",
		"/api/v1/public/event-types/11111111-1111-1111-1111-111111111111/slots",
		"/api/v1/public/event-types/11111111-1111-1111-1111-111111111111/bookings",
		"/api/v1/public/bookings/bkg_abc123",
		"/api/v1/public/bookings/bkg_abc123/ics",
	}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("Origin", "https://some-external-marketing-site.example")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d (body: %s)", w.Code, w.Body.String())
			}
			if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://some-external-marketing-site.example" {
				t.Fatalf("expected Access-Control-Allow-Origin to echo the origin, got %q", got)
			}
			if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "false" {
				t.Fatalf("expected credentials=false for the public booking API (no cookies), got %q", got)
			}
		})
	}
}

// TestSubmifyCORS_PublicBooking_PreflightAllowsGetAndPost covers the
// OPTIONS preflight response specifically — a widget on another site
// calling the GET slots endpoint (or the POST booking-creation endpoint)
// needs both methods actually listed, not just POST (which is all
// /api/submit ever needed before this fix widened the same branch).
func TestSubmifyCORS_PublicBooking_PreflightAllowsGetAndPost(t *testing.T) {
	r := newCORSTestRouter(restrictiveCfg())

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/public/event-types/xyz/slots", nil)
	req.Header.Set("Origin", "https://widget.example")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for a CORS preflight, got %d", w.Code)
	}
	allow := w.Header().Get("Access-Control-Allow-Methods")
	if !containsToken(allow, "GET") || !containsToken(allow, "POST") {
		t.Fatalf("expected Access-Control-Allow-Methods to include both GET and POST, got %q", allow)
	}
}

// TestSubmifyCORS_AuthenticatedRoutes_StillRejectUnknownOrigins is the
// regression guard: proves the new /api/v1/public/ prefix carve-out is
// scoped exactly to public routes and does not accidentally widen CORS
// for the authenticated dashboard API (which must keep rejecting an
// origin that was never allowlisted).
func TestSubmifyCORS_AuthenticatedRoutes_StillRejectUnknownOrigins(t *testing.T) {
	r := newCORSTestRouter(restrictiveCfg())

	paths := []string{"/api/v1/projects", "/api/v1/auth/me", "/api/v1/bookings", "/api/v1/event-types"}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("Origin", "https://some-external-marketing-site.example")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusForbidden {
				t.Fatalf("expected 403 for an unallowlisted origin on an authenticated route, got %d", w.Code)
			}
		})
	}
}

// TestSubmifyCORS_PublicBooking_DisableableIndependently proves the two
// any-origin surfaces are gated by separate config flags — turning off
// booking's must not silently also disable (or leave enabled) submit's.
func TestSubmifyCORS_PublicBooking_DisableableIndependently(t *testing.T) {
	cfg := restrictiveCfg()
	cfg.CorsPublicBookingAnyOrigin = false
	r := newCORSTestRouter(cfg)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/event-types/xyz", nil)
	req.Header.Set("Origin", "https://some-external-marketing-site.example")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected the public booking route to fall back to strict origin checking once disabled, got %d", w.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/api/submit", nil)
	req2.Header.Set("Origin", "https://some-external-marketing-site.example")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected /api/submit's own any-origin flag to be unaffected, got %d", w2.Code)
	}
}

func containsToken(csv, token string) bool {
	for _, part := range strings.Split(csv, ",") {
		if strings.TrimSpace(part) == token {
			return true
		}
	}
	return false
}
