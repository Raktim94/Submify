package httpapi

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"github.com/nodedr/submify/apps/api/internal/auth"
	"github.com/nodedr/submify/apps/api/internal/config"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/storage"
	"github.com/nodedr/submify/apps/api/internal/telegram"
	"github.com/nodedr/submify/apps/api/internal/update"
	"github.com/xuri/excelize/v2"
)

type Server struct {
	cfg                    config.Config
	store                  *db.Store
	tokens                 *auth.TokenManager
	checker                *update.Checker
	sensitivePublicLimiter *KeyedRateLimiter
	submitLimitIP          *KeyedRateLimiter
	submitLimitKey         *KeyedRateLimiter
	authedUserLimiter      *KeyedRateLimiter
	updateCheckMu          sync.Mutex
	lastGitHubPollAt       time.Time
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
		checker:                update.NewChecker(cfg.GitHubRepo, cfg.AppVersion, cfg.GitHubToken),
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
		secured.GET("/system/update-status", s.UpdateStatus)
		secured.GET("/dashboard/summary", s.DashboardSummary)
		secured.POST("/system/update-trigger", s.TriggerUpdate)
		secured.PUT("/users/me/integrations", s.UpdateUserIntegrations)
	}

	return r
}

func (s *Server) StartBackgroundJobs() {
	go func() {
		s.refreshGitHubVersion(true)
		ticker := time.NewTicker(s.cfg.UpdateCheckInterval)
		defer ticker.Stop()
		for range ticker.C {
			s.refreshGitHubVersion(true)
		}
	}()
}

// refreshGitHubVersion fetches latest release/tag from GitHub and persists to system_configs.
// When force is false, calls are throttled to at most once per 90s to avoid rate limits on dashboard refreshes.
func (s *Server) refreshGitHubVersion(force bool) {
	const minInterval = 90 * time.Second
	s.updateCheckMu.Lock()
	defer s.updateCheckMu.Unlock()
	if !force && !s.lastGitHubPollAt.IsZero() && time.Since(s.lastGitHubPollAt) < minInterval {
		return
	}
	s.lastGitHubPollAt = time.Now()

	ready, err := s.store.BootstrapComplete()
	if err != nil || !ready {
		return
	}
	available, latest, err := s.checker.CheckLatest()
	if err != nil {
		errMsg := strings.ToLower(err.Error())
		if strings.Contains(errMsg, "no tags") || strings.Contains(errMsg, "no release or tag found") {
			log.Printf("update check failed for repo %q: %v", s.cfg.GitHubRepo, err)
		} else {
			log.Printf("update check failed for repo %q: %v (set GITHUB_REPO to your fork; add GITHUB_TOKEN if the repo is private or you hit rate limits)", s.cfg.GitHubRepo, err)
		}
		return
	}
	if err := s.store.SetUpdateStatus(available, latest); err != nil {
		log.Printf("update status persist failed: %v", err)
	}
}

func (s *Server) TriggerUpdate(c *gin.Context) {
	if !s.cfg.AllowUpdateTrigger {
		c.JSON(http.StatusConflict, gin.H{"error": "update trigger disabled in this environment"})
		return
	}

	cmd := exec.Command("sh", "-c", s.cfg.UpdateCommand)
	if strings.Contains(strings.ToLower(s.cfg.UpdateCommand), "powershell") {
		cmd = exec.Command("powershell", "-Command", s.cfg.UpdateCommand)
	}
	if err := cmd.Start(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"status": "update started"})
}

func (s *Server) UpdateStatus(c *gin.Context) {
	force := c.Query("refresh") == "1" || c.Query("refresh") == "true"
	s.refreshGitHubVersion(force)
	cfg, err := s.store.GetSystemConfig()
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{
				"update_available":        false,
				"latest_version":          "",
				"current_version":         s.cfg.AppVersion,
				"update_trigger_enabled":  s.cfg.AllowUpdateTrigger,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"update_available":       cfg.UpdateAvail,
		"latest_version":         cfg.LatestVersion,
		"current_version":        s.cfg.AppVersion,
		"update_trigger_enabled": s.cfg.AllowUpdateTrigger,
	})
}

func buildTelegramMessage(project db.Project, data []byte, files []byte) string {
	return "New submission for " + project.Name + "\nData: " + string(data) + "\nFiles: " + string(files)
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

func notifyTelegram(project db.Project, owner db.User, data []byte, files []byte) {
	if strings.TrimSpace(owner.TelegramBotToken) == "" || strings.TrimSpace(owner.TelegramChatID) == "" {
		return
	}
	telegram.NotifyAsync(owner.TelegramBotToken, owner.TelegramChatID, buildTelegramMessage(project, data, files))
}

func makePresignInputFromUser(u db.User, projectID, filename string, expiry int) storage.PresignInput {
	return storage.PresignInput{
		Endpoint:      u.S3Endpoint,
		AccessKey:     u.S3AccessKey,
		SecretKey:     u.S3SecretKey,
		Bucket:        u.S3Bucket,
		ProjectID:     projectID,
		Filename:      filename,
		ExpiryMinutes: expiry,
	}
}
