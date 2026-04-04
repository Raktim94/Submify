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

Volumes are mounted at:

- `/var/lib/submify/data/postgres`
- `/var/lib/submify/data/rustfs`
