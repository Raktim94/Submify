package db

import (
	"database/sql"
	"embed"
	"fmt"
	"sort"
	"strings"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func RunMigrations(conn *sql.DB) error {
	if _, err := conn.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return err
	}

	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return err
	}

	versions := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		versions = append(versions, e.Name())
	}
	sort.Strings(versions)

	for _, version := range versions {
		var exists bool
		if err := conn.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)", version).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}

		sqlBytes, err := migrationFiles.ReadFile("migrations/" + version)
		if err != nil {
			return err
		}

		tx, err := conn.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(string(sqlBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %s failed: %w", version, err)
		}
		if _, err := tx.Exec("INSERT INTO schema_migrations(version) VALUES ($1)", version); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}
