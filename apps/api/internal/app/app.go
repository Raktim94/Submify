package app

import (
	"fmt"
	"net/http"
	"time"

	"github.com/nodedr/submify/apps/api/internal/config"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/httpapi"
)

func Run() error {
	cfg := config.Load()
	if err := config.Validate(cfg); err != nil {
		return err
	}
	store, err := db.Open(cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer store.DB.Close()

	if err := db.RunMigrations(store.DB); err != nil {
		return err
	}

	server := httpapi.NewServer(cfg, store)
	server.StartBackgroundJobs()

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.Router(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
	}

	fmt.Printf("submify api listening on :%s\n", cfg.Port)
	return httpServer.ListenAndServe()
}
