package httpapi

import (
	"net/http"
	"os/exec"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/update"
)

// CheckForUpdate compares this build's own baked-in version (config.Version,
// resolved at image-publish time from a real git tag — see
// docs/decisions/0009-s3-backup-and-self-update.md) against the latest
// GitHub release/tag on config.UpdateRepo, and persists the result so the
// frontend can show it without re-checking on every page load.
func (s *Server) CheckForUpdate(c *gin.Context) {
	checker := update.NewChecker(s.cfg.UpdateRepo, s.cfg.Version, s.cfg.GitHubToken)
	available, latest, err := checker.CheckLatest()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "checking for update: " + err.Error()})
		return
	}
	if err := s.store.SetUpdateCheckResult(available, latest); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"current_version":  s.cfg.Version,
		"latest_version":   latest,
		"update_available": available,
	})
}

// ApplyUpdate triggers a real self-update-and-restart. It deliberately does
// NOT run `git pull && docker compose up` itself: this container is one of
// the services `docker compose up` would recreate, so the CLI process
// issuing that command would be killed mid-sequence by its own command,
// leaving the stack half-updated (see docs/decisions/0009 for the full
// explanation). Instead it uses its own mounted docker.sock to launch a
// separate, ephemeral one-shot helper container that isn't itself being
// recreated, so it survives this container's teardown and finishes the
// update. This endpoint responds before the update finishes — the caller
// is expected to poll GET /api/v1/system/health until it responds again.
func (s *Server) ApplyUpdate(c *gin.Context) {
	repoDir := strings.TrimSpace(s.cfg.RepoDir)
	if repoDir == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "SUBMIFY_REPO_DIR is not configured — self-update is unavailable"})
		return
	}

	updateScript := "set -e; cd " + shellQuote(repoDir) + "; git pull --ff-only; docker compose up --build -d"
	args := []string{
		"run", "--rm", "-d",
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-v", repoDir + ":" + repoDir,
		"-w", repoDir,
		"docker:cli",
		"sh", "-c", updateScript,
	}

	cmd := exec.CommandContext(c.Request.Context(), "docker", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  "could not start the update helper container: " + err.Error(),
			"output": string(output),
		})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"status":  "update started",
		"message": "The application is updating and will restart shortly. This page will stop responding until it comes back up.",
	})
}

// shellQuote wraps a path in single quotes for the helper container's `sh
// -c` script, escaping any embedded single quote. repoDir comes from our
// own config (an env var an operator sets), not user input, but the
// interpolation is quoted defensively rather than trusted as pre-safe.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
