#!/bin/sh
# Create .env from .env.example if missing (required for docker compose).
set -e
cd "$(dirname "$0")/.." || exit 1
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "Missing .env.example in repo root — pull latest or restore from version control." >&2
    exit 1
  fi
  cp .env.example .env
  echo "Created .env from .env.example — edit secrets before production."
else
  echo ".env already exists; not overwriting."
fi
