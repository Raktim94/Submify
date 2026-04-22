#!/usr/bin/env bash
# Thin wrapper around `docker compose`: optional `.env.auto` (strong secrets) + optional `.env`.
#
# Default stack needs no script — run `docker compose up --build -d` (secrets have defaults in docker-compose.yml).
#
# Random secrets are generated into .env.auto automatically (first install only; keep the file with ./data/):
#   ./scripts/compose-up.sh up --build -d
#
# Usage: ./scripts/compose-up.sh logs -f api
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AUTO_ENV="${SUBMIFY_AUTO_ENV:-$ROOT/.env.auto}"

ensure_auto_env() {
  if [ -f "$AUTO_ENV" ]; then
    return 0
  fi
  echo "Creating $AUTO_ENV with auto-generated secrets." >&2
  echo "Keep this file with ./data/ — new random values will not match an existing database." >&2
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl is required to generate secrets. Install OpenSSL or create $AUTO_ENV manually (see .env.example)." >&2
    exit 1
  fi
  umask 077
  pg="$(openssl rand -hex 32)"
  jwt="$(openssl rand -hex 32)"
  cat >"$AUTO_ENV" <<EOF
# Auto-generated — do not commit. Keep with ./data/

POSTGRES_PASSWORD=${pg}
JWT_SECRET=${jwt}
EOF
}

if [ "${SUBMIFY_GENERATE_AUTO_ENV:-1}" = "1" ]; then
  ensure_auto_env
fi

compose_cmd=(docker compose --project-directory "$ROOT")
if [ -f "$AUTO_ENV" ]; then
  compose_cmd+=(--env-file "$AUTO_ENV")
fi
if [ -f "$ROOT/.env" ]; then
  compose_cmd+=(--env-file "$ROOT/.env")
fi

exec "${compose_cmd[@]}" "$@"
