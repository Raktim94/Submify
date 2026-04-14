package httpapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"github.com/nodedr/submify/apps/api/internal/auth"
	"github.com/nodedr/submify/apps/api/internal/config"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/telegram"
	"github.com/xuri/excelize/v2"
)

type Server struct {
	cfg                    config.Config
	store                  *db.Store
	tokens                 *auth.TokenManager
	sensitivePublicLimiter *KeyedRateLimiter
	submitLimitIP          *KeyedRateLimiter
	submitLimitKey         *KeyedRateLimiter
	authedUserLimiter      *KeyedRateLimiter
}

func NewServer(cfg config.Config, store *db.Store) *Server {
	sensBurst := max(8, cfg.RateLimitSensitivePublicRPM/2)
	subIPBurst := max(15, cfg.RateLimitSubmitIPRPM/3)
	subKeyBurst := max(30, cfg.RateLimitSubmitKeyRPM/3)
	authBurst := max(40, cfg.RateLimitAuthedUserRPM/5)
	return &Server{
		cfg:                    cfg,
		store:                  store,
		tokens:                 auth.NewTokenManager(cfg.JWTSecret, cfg.AccessTokenTTLMinutes, cfg.RefreshTokenTTLHours),
		sensitivePublicLimiter: NewKeyedRateLimiter(cfg.RateLimitSensitivePublicRPM, sensBurst),
		submitLimitIP:          NewKeyedRateLimiter(cfg.RateLimitSubmitIPRPM, subIPBurst),
		submitLimitKey:         NewKeyedRateLimiter(cfg.RateLimitSubmitKeyRPM, subKeyBurst),
		authedUserLimiter:      NewKeyedRateLimiter(cfg.RateLimitAuthedUserRPM, authBurst),
	}
}

func (s *Server) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{
		SkipPaths: []string{"/api/v1/system/health", "/api/v1/system/bootstrap-status"},
	}))
	r.Use(SecurityHeaders())
	if err := r.SetTrustedProxies(s.cfg.TrustedProxies); err != nil {
		log.Printf("SetTrustedProxies: %v", err)
	}
	r.Use(SubmifyCORS(s.cfg))

	submitPub := r.Group("/api")
	submitPub.Use(s.SubmitRateLimitMiddleware())
	submitPub.POST("/submit", s.Submit)

	api := r.Group("/api/v1")
	{
		api.GET("/system/bootstrap-status", s.BootstrapStatus)
		api.GET("/system/health", s.Health)
	}

	sens := api.Group("")
	sens.Use(KeyedRateLimitMiddleware(s.sensitivePublicLimiter, clientIPKey, "rate limit exceeded (login or setup); try again shortly"))
	{
		sens.POST("/auth/register", s.Register)
		sens.POST("/auth/login", s.Login)
		sens.POST("/auth/refresh", s.Refresh)
		sens.POST("/system/setup", s.SetupSystem)
		sens.POST("/auth/logout", s.Logout)
	}

	secured := api.Group("")
	secured.Use(s.SetupGuard())
	secured.Use(s.AuthGuard())
	secured.Use(s.AuthedUserRateLimitMiddleware())
	{
		secured.GET("/auth/me", s.GetMe)
		secured.GET("/projects", s.ListProjects)
		secured.POST("/projects", s.CreateProject)
		secured.PATCH("/projects/:id", s.UpdateProject)
		secured.GET("/projects/:id/submissions", s.ListSubmissions)
		secured.DELETE("/projects/:id/submissions/bulk", s.BulkDeleteSubmissions)
		secured.POST("/uploads/presign", s.PresignUpload)
		secured.GET("/projects/:id/export", s.Export)
		secured.GET("/dashboard/summary", s.DashboardSummary)
		secured.PUT("/users/me/integrations", s.UpdateUserIntegrations)
	}

	return r
}

func (s *Server) StartBackgroundJobs() {
}

func buildTelegramMessage(project db.Project, data []byte, files []byte) string {
	var b strings.Builder
	b.WriteString("New submission received")
	if name := strings.TrimSpace(project.Name); name != "" {
		b.WriteString("\nProject: ")
		b.WriteString(name)
	}

	if rendered := formatSubmissionData(data); rendered != "" {
		b.WriteString("\n\nData\n")
		b.WriteString(rendered)
	}

	b.WriteString("\n\nFiles\n")
	b.WriteString(formatSubmissionFiles(files))

	return b.String()
}

func formatSubmissionData(data []byte) string {
	var payload map[string]interface{}
	if len(bytes.TrimSpace(data)) == 0 || json.Unmarshal(data, &payload) != nil || len(payload) == 0 {
		return "- (no fields)"
	}

	keys := make([]string, 0, len(payload))
	for k := range payload {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		label := humanizeFieldKey(key)
		value := formatSubmissionValue(payload[key])
		lines = append(lines, fmt.Sprintf("- %s: %s", label, value))
	}
	return strings.Join(lines, "\n")
}

func formatSubmissionFiles(files []byte) string {
	var list []interface{}
	if len(bytes.TrimSpace(files)) == 0 || json.Unmarshal(files, &list) != nil || len(list) == 0 {
		return "- None"
	}

	lines := make([]string, 0, len(list))
	for _, item := range list {
		lines = append(lines, "- "+formatFileItem(item))
	}
	return strings.Join(lines, "\n")
}

func formatFileItem(item interface{}) string {
	switch v := item.(type) {
	case string:
		if strings.TrimSpace(v) == "" {
			return "(empty file entry)"
		}
		return v
	case map[string]interface{}:
		name := strings.TrimSpace(stringFromMap(v, "name"))
		url := strings.TrimSpace(stringFromMap(v, "url"))
		if name != "" && url != "" {
			return fmt.Sprintf("%s (%s)", name, url)
		}
		if url != "" {
			return url
		}
		if name != "" {
			return name
		}
		raw, _ := json.Marshal(v)
		return string(raw)
	default:
		raw, _ := json.Marshal(v)
		return string(raw)
	}
}

func stringFromMap(m map[string]interface{}, key string) string {
	raw, ok := m[key]
	if !ok || raw == nil {
		return ""
	}
	if s, ok := raw.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", raw)
}

func formatSubmissionValue(v interface{}) string {
	switch t := v.(type) {
	case nil:
		return "(empty)"
	case string:
		trimmed := strings.TrimSpace(t)
		if trimmed == "" {
			return "(empty)"
		}
		if strings.Contains(trimmed, "\n") {
			chunks := strings.Split(trimmed, "\n")
			for i := range chunks {
				chunks[i] = strings.TrimSpace(chunks[i])
			}
			return strings.Join(chunks, " | ")
		}
		return trimmed
	case bool:
		if t {
			return "Yes"
		}
		return "No"
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		raw, err := json.Marshal(t)
		if err != nil {
			return fmt.Sprintf("%v", t)
		}
		return string(raw)
	}
}

func humanizeFieldKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return "Field"
	}

	var b strings.Builder
	lastWasSpace := false
	var prev rune
	for i, r := range key {
		if r == '_' || r == '-' {
			if !lastWasSpace {
				b.WriteRune(' ')
				lastWasSpace = true
			}
			prev = r
			continue
		}
		if i > 0 && unicode.IsUpper(r) && (unicode.IsLower(prev) || unicode.IsDigit(prev)) && !lastWasSpace {
			b.WriteRune(' ')
		}
		b.WriteRune(r)
		lastWasSpace = false
		prev = r
	}

	parts := strings.Fields(strings.TrimSpace(b.String()))
	for i := range parts {
		p := strings.ToLower(parts[i])
		if len(p) == 0 {
			continue
		}
		parts[i] = strings.ToUpper(p[:1]) + p[1:]
	}
	return strings.Join(parts, " ")
}

// --- Export: flatten JSON `data` into spreadsheet columns (XLSX/PDF) ---

func parseDataFields(data json.RawMessage) map[string]string {
	out := make(map[string]string)
	if len(data) == 0 {
		return out
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		out["_data_raw"] = string(data)
		return out
	}
	for k, v := range raw {
		out[k] = valueToExportCell(v)
	}
	return out
}

func valueToExportCell(v interface{}) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case bool:
		return strconv.FormatBool(t)
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		return t.String()
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func collectExportDataKeys(rows []db.Submission) []string {
	seen := make(map[string]bool)
	for _, row := range rows {
		for k := range parseDataFields(row.Data) {
			if !seen[k] {
				seen[k] = true
			}
		}
	}
	keys := make([]string, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func exportHeaders(dataKeys []string) []string {
	h := make([]string, 0, 2+len(dataKeys)+4)
	h = append(h, "ID", "ProjectID")
	h = append(h, dataKeys...)
	h = append(h, "Files", "ClientIP", "UserAgent", "CreatedAt")
	return h
}

func exportRowStrings(row db.Submission, dataKeys []string) []string {
	fields := parseDataFields(row.Data)
	out := make([]string, 0, 2+len(dataKeys)+4)
	out = append(out, row.ID, row.ProjectID)
	for _, k := range dataKeys {
		out = append(out, fields[k])
	}
	out = append(out, string(row.Files))
	ip := ""
	if row.ClientIP != nil {
		ip = *row.ClientIP
	}
	ua := ""
	if row.UserAgent != nil {
		ua = *row.UserAgent
	}
	out = append(out, ip, ua, row.CreatedAt.UTC().Format(time.RFC3339))
	return out
}

func truncatePDF(s string, max int) string {
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) <= max {
		return s
	}
	if max < 4 {
		return s[:max]
	}
	return s[:max-1] + "…"
}

func writeExcel(rows []db.Submission) ([]byte, error) {
	dataKeys := collectExportDataKeys(rows)
	headers := exportHeaders(dataKeys)

	f := excelize.NewFile()
	sheet := "Submissions"
	f.SetSheetName("Sheet1", sheet)

	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}
	for ri, row := range rows {
		rIdx := ri + 2
		vals := exportRowStrings(row, dataKeys)
		for ci, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(ci+1, rIdx)
			_ = f.SetCellStr(sheet, cell, v)
		}
	}
	buffer, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func writePDF(rows []db.Submission) ([]byte, error) {
	dataKeys := collectExportDataKeys(rows)
	headers := exportHeaders(dataKeys)

	pdf := gofpdf.New("L", "mm", "A4", "")
	pdf.SetAutoPageBreak(true, 12)
	pdf.AddPage()

	margin := 8.0
	pageW := 297.0 - 2*margin
	colW := pageW / float64(max(len(headers), 1))
	rowH := 5.5
	hdrH := 6.0
	fontSize := 7.0
	if colW >= 22 {
		fontSize = 8.0
	} else if colW < 14 {
		fontSize = 6.0
		rowH = 5.0
	}

	pdf.SetMargins(margin, margin, margin)

	drawHeader := func() {
		pdf.SetFont("Arial", "B", fontSize+0.5)
		for _, h := range headers {
			pdf.CellFormat(colW, hdrH, truncatePDF(h, 36), "1", 0, "CM", true, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetFont("Arial", "", fontSize)
	}

	pdf.SetFillColor(240, 242, 252)
	drawHeader()
	pdf.SetFillColor(255, 255, 255)

	for _, row := range rows {
		if pdf.GetY()+rowH > 200 {
			pdf.AddPage()
			drawHeader()
		}
		vals := exportRowStrings(row, dataKeys)
		for _, v := range vals {
			pdf.CellFormat(colW, rowH, truncatePDF(v, 90), "1", 0, "LM", false, 0, "")
		}
		pdf.Ln(-1)
	}

	buf := bytes.NewBuffer(nil)
	if err := pdf.Output(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func notifyTelegram(project db.Project, data []byte, files []byte) {
	if strings.TrimSpace(project.TelegramBotToken) == "" || strings.TrimSpace(project.TelegramChatID) == "" {
		return
	}
	telegram.NotifyAsync(project.TelegramBotToken, project.TelegramChatID, buildTelegramMessage(project, data, files))
}

