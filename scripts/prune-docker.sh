#!/bin/sh
# Remove old Docker images and build cache so new builds do not fill the disk.
#
# SAFE: Does not remove volumes or bind mounts — PostgreSQL and MinIO data under
# ./data/postgres and ./data/rustfs (default compose) are untouched. Never run `docker volume prune` or
# `docker system prune --volumes` here unless you intend to wipe named volumes.
#
# Suggested cron (weekly, as root or docker group user):
#   0 3 * * 0 /path/to/Submify/scripts/prune-docker.sh >> /var/log/submify-docker-prune.log 2>&1
#
set -e

echo "$(date -Iseconds) prune-docker: starting"

# Unused BuildKit / legacy builder cache (old layers from repeated builds)
docker builder prune -f 2>/dev/null || true

# Stopped containers, unused networks, dangling images, build cache
docker system prune -f

# Dangling images only (extra safety vs aggressive -a)
docker image prune -f

echo "$(date -Iseconds) prune-docker: done"
