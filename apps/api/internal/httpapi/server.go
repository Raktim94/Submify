package httpapi

import (
	"bytes"
	"database/sql"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jung-kurt/gofpdf"
	"github.com/nodedr/submify/apps/api/internal/auth"
	"github.com/nodedr/submify/apps/api/internal/config"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/storage"
	"github.com/nodedr/submify/apps/api/internal/telegram"
	"github.com/nodedr/submify/apps/api/internal/update"
	"github.com/xuri/excelize/v2"
	"golang.org/x/time/rate"
)

type Server struct {
	cfg     config.Config
	store   *db.Store
	tokens  *auth.TokenManager
	checker *update.Checker
	limiter *IPRateLimiter
}

func NewServer(cfg config.Config, store *db.Store) *Server {
	return &Server{
		cfg:     cfg,
		store:   store,
		tokens:  auth.NewTokenManager(cfg.JWTSecret, cfg.AccessTokenTTLMinutes, cfg.RefreshTokenTTLHours),
		checker: update.NewChecker(cfg.GitHubRepo, cfg.AppVersion),
		limiter: NewIPRateLimiter(rate.Every(6*time.Second), 10),
	}
}

func (s *Server) Router() *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.Logger())
	r.Use(SecurityHeaders())
	r.Use(s.RateLimitMiddleware())
	r.Use(cors.New(cors.Config{
		AllowOrigins:     s.cfg.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "x-api-key"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	api := r.Group("/api/v1")
	{
		api.GET("/system/bootstrap-status", s.BootstrapStatus)
		api.POST("/system/setup", s.SetupSystem)
		api.GET("/system/health", s.Health)
		api.POST("/auth/login", s.Login)
		api.POST("/auth/refresh", s.Refresh)
		api.POST("/auth/logout", s.Logout)
		api.POST("/submit/:project_key", s.Submit)
	}

	secured := api.Group("")
	secured.Use(s.SetupGuard())
	secured.Use(s.AuthGuard())
	{
		secured.GET("/projects", s.ListProjects)
		secured.POST("/projects", s.CreateProject)
		secured.PATCH("/projects/:id", s.UpdateProject)
		secured.GET("/projects/:id/submissions", s.ListSubmissions)
		secured.DELETE("/projects/:id/submissions/bulk", s.BulkDeleteSubmissions)
		secured.POST("/uploads/presign", s.PresignUpload)
		secured.GET("/projects/:id/export", s.Export)
		secured.GET("/system/update-status", s.UpdateStatus)
		secured.POST("/system/update-trigger", s.TriggerUpdate)
		secured.PUT("/system/config", s.UpdateSystemConfig)
	}

	return r
}

func (s *Server) StartBackgroundJobs() {
	go func() {
		ticker := time.NewTicker(s.cfg.UpdateCheckInterval)
		defer ticker.Stop()
		for {
			s.checkAndPersistUpdate()
			<-ticker.C
		}
	}()
}

func (s *Server) checkAndPersistUpdate() {
	ready, err := s.store.BootstrapComplete()
	if err != nil || !ready {
		return
	}
	available, latest, err := s.checker.CheckLatest()
	if err != nil {
		log.Printf("update check failed: %v", err)
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
	cfg, err := s.store.GetSystemConfig()
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"update_available": false, "latest_version": "", "current_version": s.cfg.AppVersion})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"update_available": cfg.UpdateAvail,
		"latest_version":  cfg.LatestVersion,
		"current_version": s.cfg.AppVersion,
	})
}

func buildTelegramMessage(project db.Project, data []byte, files []byte) string {
	return "New submission for " + project.Name + "\nData: " + string(data) + "\nFiles: " + string(files)
}

func projectAPIKey() string {
	return uuid.NewString()
}

func writeExcel(rows []db.Submission) ([]byte, error) {
	f := excelize.NewFile()
	sheet := "Submissions"
	f.SetSheetName("Sheet1", sheet)
	headers := []string{"ID", "ProjectID", "Data", "Files", "CreatedAt"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}
	for i, row := range rows {
		idx := i + 2
		f.SetCellValue(sheet, "A"+strconv.Itoa(idx), row.ID)
		f.SetCellValue(sheet, "B"+strconv.Itoa(idx), row.ProjectID)
		f.SetCellValue(sheet, "C"+strconv.Itoa(idx), string(row.Data))
		f.SetCellValue(sheet, "D"+strconv.Itoa(idx), string(row.Files))
		f.SetCellValue(sheet, "E"+strconv.Itoa(idx), row.CreatedAt.Format(time.RFC3339))
	}
	buffer, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func writePDF(rows []db.Submission) ([]byte, error) {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddPage()
	pdf.SetFont("Arial", "", 10)
	pdf.MultiCell(0, 6, "Submify Submission Export", "", "L", false)
	for _, row := range rows {
		line := row.ID + " | " + row.CreatedAt.Format(time.RFC3339)
		pdf.MultiCell(0, 5, line, "", "L", false)
		pdf.MultiCell(0, 5, "Data: "+string(row.Data), "", "L", false)
		pdf.MultiCell(0, 5, "Files: "+string(row.Files), "", "L", false)
		pdf.Ln(2)
	}
	buf := bytes.NewBuffer(nil)
	if err := pdf.Output(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func notifyTelegram(project db.Project, cfg db.SystemConfig, data []byte, files []byte) {
	telegram.NotifyAsync(cfg.TelegramToken, cfg.TelegramChatID, buildTelegramMessage(project, data, files))
}

func makePresignInput(cfg db.SystemConfig, projectID, filename string, expiry int) storage.PresignInput {
	return storage.PresignInput{
		Endpoint:      cfg.S3Endpoint,
		AccessKey:     cfg.S3AccessKey,
		SecretKey:     cfg.S3SecretKey,
		Bucket:        cfg.S3Bucket,
		ProjectID:     projectID,
		Filename:      filename,
		ExpiryMinutes: expiry,
	}
}
