#!/bin/sh
# Run from repo root: ./scripts/pull-latest.sh
# Drops uncommitted edits to scripts/prune-docker.sh (common pull blocker), then git pull.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
if ! git diff --quiet -- scripts/prune-docker.sh 2>/dev/null; then
  echo "Discarding uncommitted changes in scripts/prune-docker.sh (upstream wins)."
  git checkout -- scripts/prune-docker.sh
fi
exec git pull "$@"
