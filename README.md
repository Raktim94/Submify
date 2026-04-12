# Submify

Submify is a self-hosted **Form Backend as a Service (FBaaS)** stack: a Go (Gin) API, Next.js dashboard, PostgreSQL, S3-compatible object storage (RustFS/MinIO in Compose), and Nginx as a single entrypoint.

**Upstream repository:** [https://github.com/Raktim94/Submify.git](https://github.com/Raktim94/Submify.git)

---

## Table of contents

1. [Architecture](#architecture)
2. [What you get](#what-you-get)
3. [Requirements](#requirements)
4. [Installation (Docker Compose)](#installation-docker-compose)
5. [Configuration and environment variables](#configuration-and-environment-variables)
6. [First-time setup (`/setup`)](#first-time-setup-setup)
7. [Optional: Cloudflare Tunnel](#optional-cloudflare-tunnel)
8. [API overview](#api-overview)
9. [Connecting a client website (forms)](#connecting-a-client-website-forms)
10. [Presigned uploads (optional)](#presigned-uploads-optional)
11. [Dashboard workflow](#dashboard-workflow)
12. [Limits and security defaults](#limits-and-security-defaults)
13. [Operations: logs, backup, updates](#operations-logs-backup-updates)
14. [Troubleshooting](#troubleshooting)
15. [Codebase review (health check)](#codebase-review-health-check)

---

## Architecture

- **Nginx** listens on port **2512** and proxies:
  - `/api/*` → API (Go, port 8080 in the container)
  - `/*` → Next.js (port 3000 in the container)
- **PostgreSQL** stores users, projects, submissions, and system configuration.
- **RustFS / MinIO** (`rustfs` service) provides an S3-compatible API for presigned uploads when configured.

The browser and external clients should use **one origin** for dashboard + API (e.g. `https://forms.example.com:2512/api/v1/...`) or configure **CORS** for separate sites (see [Connecting a client website](#connecting-a-client-website-forms)).

---

## What you get

- JSON form submission API keyed per project (`public_api_key`)
- Admin login (JWT access + refresh tokens)
- Projects CRUD, submission list, bulk delete
- Export submissions as **XLSX** or **PDF**
- Optional **Telegram** notification on new submission
- Optional **presigned PUT** to S3-compatible storage for file uploads

Email notifications are **not** implemented in this release; you can send mail from your own app after posting to Submify if needed.

---

## Requirements

- **Docker Engine** and **Docker Compose** (v2 plugin)
- Host firewall / security group allowing inbound **TCP 2512** (or your reverse proxy port)
- For production: TLS termination (reverse proxy or tunnel) is strongly recommended

**Note:** `docker-compose.yml` uses Linux-style bind mounts under `/var/lib/submify/data/...`. That path is normal on Linux VPS deployments. On Windows Docker Desktop you may need to adjust volume mappings for local development; production guidance assumes a Linux server.

---

## Installation (Docker Compose)

### 1. Clone

```bash
git clone https://github.com/Raktim94/Submify.git
cd Submify
```

### 2. Set secrets and origins (recommended before first boot)

Create a `.env` next to `docker-compose.yml` (Compose loads it automatically) or export variables in your shell:

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signing key for JWTs (change from default in production) |
| `ALLOWED_ORIGINS` | Comma-separated browser origins allowed by CORS (e.g. `https://mysite.com,https://app.mysite.com`) |
| `RUSTFS_ROOT_USER` / `RUSTFS_ROOT_PASSWORD` | MinIO root credentials (defaults exist; override in production) |
| `TUNNEL_TOKEN` | Only if using the `tunnel` Compose profile |

Example:

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
export ALLOWED_ORIGINS="http://localhost:2512,https://yourdomain.com"
```

### 3. Start the stack

```bash
docker compose up --build -d
docker compose ps
```

### 4. Open the app

- **Dashboard:** `http://<host>:2512`
- **API base:** `http://<host>:2512/api/v1`

### 5. View logs

```bash
docker compose logs -f api
docker compose logs -f nginx
```

---

## Configuration and environment variables

Values used by the **API** container (see `docker-compose.yml` and `apps/api/internal/config/config.go`):

| Variable | Default (if unset) | Meaning |
|----------|----------------------|---------|
| `PORT` | `8080` | HTTP port inside the API container |
| `DATABASE_URL` | Compose default to `db` | PostgreSQL connection string |
| `JWT_SECRET` | `change-this-in-production` | JWT HMAC secret |
| `ALLOWED_ORIGINS` | `http://localhost:2512` | CORS allowlist (comma-separated) |
| `APP_VERSION` | `0.1.0` | Reported version |
| `GITHUB_REPO` | `nodedr/submify` | Used for update checks |
| `UPDATE_CHECK_MINUTES` | `360` | Background update check interval |
| `ALLOW_UPDATE_TRIGGER` | `false` | Allow `POST /system/update-trigger` |
| `UPDATE_COMMAND` | `docker compose pull && docker compose up -d` | Command run when update is triggered |
| `UPLOAD_MAX_SIZE_BYTES` | `26214400` (25 MiB) | Max upload size for presign |
| `UPLOAD_ALLOWED_MIME` | `image/png,image/jpeg,application/pdf,text/plain` | Allowed MIME types for presign |
| `PRESIGN_EXPIRY_MINUTES` | `10` | Presigned URL lifetime |
| `ACCESS_TOKEN_TTL_MINUTES` | `30` | Access token lifetime |
| `REFRESH_TOKEN_TTL_HOURS` | `168` | Refresh token lifetime |

**Web** container:

| Variable | Typical value | Meaning |
|----------|----------------|---------|
| `NEXT_PUBLIC_API_BASE` | `/api/v1` | Browser-side API prefix (relative URL works behind Nginx) |

---

## First-time setup (`/setup`)

On first launch, the app redirects to **`/setup`** until a system row exists in the database.

You will enter:

- S3-compatible endpoint, access key, secret, bucket (RustFS/MinIO endpoint from your deployment or external S3)
- Telegram bot token and chat ID (required by the setup form; use real values or placeholders if you do not use Telegram)
- Admin email and password (minimum 8 characters; password hashed with Argon2id)

After setup:

1. Log in at **`/login`**
2. Create a **project** and copy **`public_api_key`**
3. Use that key in your website integration (see below)

**Dashboard-only / no real S3:** You can enter placeholder non-empty S3 values to pass setup. JSON submissions and the dashboard will work; **health** may report S3 degraded until valid storage is configured, and **presign/upload** will not work until real S3 settings are saved under **Settings**.

---

## Optional: Cloudflare Tunnel

For servers behind CGNAT or when you want Cloudflare in front:

```bash
export TUNNEL_TOKEN="your-token"
docker compose --profile tunnel up -d
```

The `cloudflared` service depends on Nginx; ensure DNS and tunnel config point to your service.

---

## API overview

Authoritative route list lives in `apps/api/internal/httpapi/server.go`. A detailed contract (bodies, responses) is in **[docs/api.md](docs/api.md)**.

Summary:

| Area | Method | Path | Auth |
|------|--------|------|------|
| Bootstrap | GET | `/api/v1/system/bootstrap-status` | None |
| Setup | POST | `/api/v1/system/setup` | None (once) |
| Health | GET | `/api/v1/system/health` | None |
| Auth | POST | `/api/v1/auth/login`, `/auth/refresh`, `/auth/logout` | None |
| Submit | POST | `/api/v1/submit/{project_key}` | Header `x-api-key` (must match `project_key`) |
| Projects | GET, POST | `/api/v1/projects` | Bearer |
| Project | PATCH | `/api/v1/projects/{id}` | Bearer |
| Submissions | GET | `/api/v1/projects/{id}/submissions` | Bearer |
| Bulk delete | DELETE | `/api/v1/projects/{id}/submissions/bulk` | Bearer |
| Presign | POST | `/api/v1/uploads/presign` | Bearer |
| Export | GET | `/api/v1/projects/{id}/export?format=xlsx|pdf` | Bearer |
| Updates | GET, POST | `/api/v1/system/update-status`, `/system/update-trigger` | Bearer |
| Config | PUT | `/api/v1/system/config` | Bearer |

---

## Connecting a client website (forms)

### 1. Get the project key

In the dashboard, create a project and copy **`public_api_key`** (a UUID string). This value is both:

- The **`project_key`** path segment: `POST /api/v1/submit/<public_api_key>`
- The **`x-api-key`** header value (the server requires them to **match**)

### 2. CORS for browser-based forms on another domain

If the user’s browser runs JavaScript on **`https://client.example.com`** and calls Submify on **`https://api.example.com`**, set:

```bash
ALLOWED_ORIGINS=https://client.example.com
```

You can list multiple origins separated by commas. Restart the API container after changing env.

### 3. Recommended JSON body

```json
{
  "data": {
    "name": "Jane",
    "email": "jane@example.com",
    "message": "Hello"
  },
  "files": []
}
```

Flat objects (without `data` / `files`) are also accepted; they are stored as the submission payload.

### 4. Example: `fetch` from the browser

```javascript
const PROJECT_KEY = "<public_api_key>";
const API_BASE = "https://your-submify-host:2512/api/v1";

await fetch(`${API_BASE}/submit/${PROJECT_KEY}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": PROJECT_KEY
  },
  body: JSON.stringify({
    data: { name: "Jane", email: "jane@example.com", message: "Hi" },
    files: []
  })
});
```

### 5. Example: Next.js server action / route (keeps key out of client if you proxy)

You can call Submify from **your** backend with the same `POST /submit/{key}` contract so the project key never ships to the browser (implement a route that forwards the body).

### 6. Rate limits

The API applies **10 requests per minute per IP** across routes. High-traffic public forms should sit behind your own CDN or server-side proxy if you need higher burst capacity.

---

## Presigned uploads (optional)

1. Authenticated user calls **`POST /api/v1/uploads/presign`** with `project_id`, `filename`, `content_type`, `size`.
2. Response contains **`upload_url`** (HTTP PUT) and **`object_key`**.
3. Client **`PUT`**s the file bytes to **`upload_url`**.
4. Reference **`object_key`** (or your own metadata) inside submission JSON under **`files`** as your app requires.

MIME types and max size are enforced server-side (`UPLOAD_ALLOWED_MIME`, `UPLOAD_MAX_SIZE_BYTES`).

---

## Dashboard workflow

1. Log in as admin  
2. Create projects and copy **API keys**  
3. Point website forms at **`POST /api/v1/submit/{key}`**  
4. Review submissions under each project  
5. Export **XLSX** or **PDF**; use **bulk delete** to stay under the per-project cap  

---

## Limits and security defaults

| Item | Value |
|------|--------|
| Submissions per project | **5000** (then `429`) |
| Password hashing | **Argon2id** |
| JWT | Access + refresh; Bearer auth for dashboard APIs |
| Rate limit | **10 req/min/IP** |
| Tenant isolation | Project ownership checked on authenticated routes |

Use **HTTPS** in production, rotate **`public_api_key`** if exposed inappropriately, and treat the admin account like infrastructure access.

---

## Operations: logs, backup, updates

**Logs:** `docker compose logs -f [service]`

**Update images / rebuild:**

```bash
git pull
docker compose up --build -d
```

**Backups:** Persisted data (see `docker-compose.yml`):

- `/var/lib/submify/data/postgres`
- `/var/lib/submify/data/rustfs`

Back up these directories on a schedule appropriate to your RPO/RTO.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Nothing on port 2512 | Firewall, `docker compose ps`, Nginx logs |
| Setup loop | DB healthy, API logs, `system_configs` row |
| `401` on submit | `x-api-key` equals URL `project_key` and matches a project |
| `429` on submit | Per-project 5000 cap or global IP rate limit |
| CORS errors from browser | `ALLOWED_ORIGINS` includes your site’s exact origin (scheme + host + port) |
| S3 degraded in health | Expected with placeholder S3; fix credentials in Settings |

---

## Codebase review (health check)

Review performed against the code in this repository (handlers, routes, middleware, Compose, Nginx):

| Area | Assessment |
|------|------------|
| Routes vs [docs/api.md](docs/api.md) | Aligned with `apps/api/internal/httpapi/server.go` |
| Submit auth | URL `project_key` and `x-api-key` must match and exist in DB |
| Secured routes | `SetupGuard` + `AuthGuard` + ownership checks on project-scoped handlers |
| Nginx | `/api/` → API, `/` → web; `client_max_body_size 30M` |
| Frontend API | `apps/web/lib/api.ts` uses `NEXT_PUBLIC_API_BASE` default `/api/v1` |
| Module path | Go module is `github.com/nodedr/submify/apps/api` (forks keep import paths or use replace directives if forking internals) |

**Operational notes (not necessarily bugs):**

- Global IP rate limit applies to **all** routes, including `/system/health` and submit—tune at the edge if you need aggressive monitoring without hitting limits.
- `GITHUB_REPO` defaults to `nodedr/submify`; set it if you rely on update checks against a fork.
- Automated tests were not executed in this environment (Go toolchain not available on the review host); run `go test ./...` under `apps/api` where Go is installed.

---

## License

This project is licensed under **Business Source License 1.1** — see [LICENSE](LICENSE).

---

## Links

- Repository: [https://github.com/Raktim94/Submify.git](https://github.com/Raktim94/Submify.git)
- API detail: [docs/api.md](docs/api.md)
- Deployment shortcuts: [docs/deployment.md](docs/deployment.md)
