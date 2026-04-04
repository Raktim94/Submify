# Submify

Submify is a self-hosted Form Backend as a Service (FBaaS) by NodeDr.

## Stack

- Backend: Go + Gin
- Frontend: Next.js App Router + Tailwind
- Database: PostgreSQL
- Object Storage: RustFS-compatible S3 endpoint
- Proxy: Nginx (single ingress on port `2512`)
- Deployment: Docker Compose

## Quick Start

1. Ensure Docker + Docker Compose are installed.
2. Start services:

```bash
docker compose up --build -d
```

3. Open `http://localhost:2512`.
4. On first boot, complete `/setup` with S3, Telegram, and admin credentials.

## Optional Cloudflare Tunnel (CGNAT)

Run with tunnel profile:

```bash
docker compose --profile tunnel up -d
```

Set `TUNNEL_TOKEN` in environment before starting.

## API Highlights

- `POST /api/v1/system/setup`
- `POST /api/v1/auth/login`
- `POST /api/v1/submit/{project_key}` with header `x-api-key`
- `POST /api/v1/uploads/presign`
- `GET /api/v1/projects/{id}/export?format=xlsx|pdf`

## Limits and Security Defaults

- Rate limit: `10 req/min/IP`
- Submission cap: `5000` per project
- Password hashing: Argon2id
- Tenant isolation by authenticated user and project ownership checks

## License

This project is licensed under Business Source License 1.1. See [LICENSE](./LICENSE).
