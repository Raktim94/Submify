#!/usr/bin/env bash
# Submify one-command installer.
#
#   curl -fsSL https://raw.githubusercontent.com/Raktim94/Submify/main/install.sh | bash
#
# Clones (or updates) Submify and starts the full stack (Postgres + API + Web + Nginx)
# via Docker Compose, with auto-generated secrets on first run. Re-running this script
# in an existing install just pulls latest and redeploys.
set -euo pipefail

REPO_URL="${SUBMIFY_REPO_URL:-https://github.com/Raktim94/Submify.git}"
INSTALL_DIR="${SUBMIFY_INSTALL_DIR:-Submify}"

log() { printf '\n[submify] %s\n' "$1"; }
die() { printf '\n[submify] error: %s\n' "$1" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required. Install git and re-run."
command -v docker >/dev/null 2>&1 || die "Docker is required: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin is required (docker compose version failed)."

# Verify the current directory is writable before attempting a clone.
if [ ! -w "." ]; then
  die "Current directory ($(pwd)) is not writable by this user.
       Run the installer from your home directory instead:
         cd ~ && curl -fsSL https://raw.githubusercontent.com/Raktim94/Submify/main/install.sh | bash
       Or set a custom install path:
         SUBMIFY_INSTALL_DIR=/path/to/writable/dir curl -fsSL ... | bash"
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  log "Existing clone found at ./$INSTALL_DIR — updating."
  git -C "$INSTALL_DIR" checkout -- scripts/prune-docker.sh >/dev/null 2>&1 || true
  git -C "$INSTALL_DIR" pull --ff-only
else
  log "Cloning Submify into ./$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
chmod +x scripts/*.sh 2>/dev/null || true

log "Building and starting the stack (this can take a few minutes on first run)..."
./scripts/compose-up.sh up --build -d

log "Submify is starting."
echo "  Dashboard: http://localhost:${SUBMIFY_PORT:-2512}"
echo "  Health:    http://localhost:${SUBMIFY_PORT:-2512}/api/v1/system/health"
echo ""
echo "Follow logs with:  cd $INSTALL_DIR && docker compose logs -f"
