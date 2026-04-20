#!/bin/sh
# Create optional .env from .env.example (CORS, tunnel, production secrets, etc.).
# The stack runs without .env — defaults live in docker-compose.yml.
set -e
cd "$(dirname "$0")/.." || exit 1
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "Missing .env.example in repo root — pull latest or restore from version control." >&2
    exit 1
  fi
  cp .env.example .env
  echo "Created .env from .env.example — uncomment and set any values you need."
else
  echo ".env already exists; not overwriting."
fi
