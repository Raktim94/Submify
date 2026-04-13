# Deployment Guide

## Requirements

- Docker Engine + Docker Compose
- Open port `2512` on your VPS/firewall

## Run

```bash
docker compose up --build -d
```

Open:

- Dashboard: `http://<host>:2512`
- API base: `http://<host>:2512/api/v1`

## First-Time Setup

1. Visit `/setup`.
2. Enter S3-compatible RustFS endpoint and credentials.
3. Enter Telegram bot token + chat ID.
4. Create admin credentials.

## Cloudflare Tunnel (CGNAT)

Set tunnel token and run tunnel profile:

```bash
export TUNNEL_TOKEN=...
docker compose --profile tunnel up -d
```

## Persistence

Data is stored on the **host** (bind mounts), not inside the API container image:

- `/var/lib/submify/data/postgres` — PostgreSQL files survive `docker compose restart` and `docker compose down`
- `/var/lib/submify/data/rustfs` — object storage (MinIO) data

Set a strong `POSTGRES_PASSWORD` in production (same value is interpolated into the API `DATABASE_URL` in Compose). Avoid `docker compose down -v` unless you intend to delete **named** volumes (this stack uses bind mounts by default, but `-v` is still risky if you add named volumes later).
