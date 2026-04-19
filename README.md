# Submify

Submify is a self-hosted **Form Backend as a Service (FBaaS)** stack: a Go (Gin) API, Next.js dashboard, PostgreSQL, S3-compatible object storage (**MinIO** by default, Compose service name **`rustfs`**), and Nginx as a single entrypoint.

**Upstream repository:** [https://github.com/Raktim94/Submify.git](https://github.com/Raktim94/Submify.git)

---

## Table of contents

1. [Architecture](#architecture)
2. [What you get](#what-you-get)
3. [Requirements](#requirements)
4. [Installation (Docker Compose)](#installation-docker-compose)
5. [URLs and ports (browser vs containers)](#urls-and-ports-browser-vs-containers)
6. [Configuration and environment variables](#configuration-and-environment-variables)
7. [First-time access](#first-time-access)
8. [Optional: Cloudflare Tunnel](#optional-cloudflare-tunnel)
9. [API overview](#api-overview)
10. [Connecting a client website (forms)](#connecting-a-client-website-forms)
11. [Presigned uploads (optional)](#presigned-uploads-optional)
12. [Dashboard workflow](#dashboard-workflow)
13. [Limits and security defaults](#limits-and-security-defaults)
14. [Operations: logs, backup, updates](#operations-logs-backup-updates)
15. [Troubleshooting](#troubleshooting)
16. [Codebase review (health check)](#codebase-review-health-check)
17. [Developer & Ownership](#developer--ownership)

---

## Architecture

- **Nginx** listens on port **2512** and proxies:
  - `/api/*` → API (Go, port 8080 in the container)
  - `/*` → Next.js (port 3000 in the container)
- **PostgreSQL** stores all tenants in one database (JSONB-friendly, battle-tested). Rows are scoped by `user_id` / `project_id`; the API never lists or mutates another user’s data.
- **Object storage** — the Compose service is named **`rustfs`** (hostname `rustfs` inside the network). By default it runs **`minio/minio`** (S3-compatible API). Set **`RUSTFS_IMAGE`** to swap in another S3-compatible image if needed. Data is stored on the host under `/var/lib/submify/data/rustfs`.

The browser and external clients should use **one origin** for dashboard + API (e.g. `https://forms.example.com:2512/api/v1/...`) or configure **CORS** for separate sites (see [Connecting a client website](#connecting-a-client-website-forms)).

---

## What you get

- JSON form submission API: **one primary `api_key` per account** (embed on all sites) plus optional per-project legacy keys
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

### 2. Environment file (required before first boot)

Docker Compose **requires** secrets in a **`.env`** file next to `docker-compose.yml` (Compose loads it automatically). Templates are **versioned** in the repo:

| File | Role |
|------|------|
| **`.env.example`** (repo root) | Copy to `.env` and edit values — **required** vars for Compose |
| **`apps/web/.env.example`** | Optional Next.js / marketing contact-proxy vars (see [§5b](#5b-nextjs-marketing-contact-form-nodedr-hosted-api-proxy)) |

Create `.env` from the template:

```bash
cp .env.example .env
# or: ./scripts/setup-env.sh
```

Edit `.env` and set at least:

| Variable | Purpose |
|----------|---------|
| **`POSTGRES_PASSWORD`** | PostgreSQL password (must match what Compose wires into `DATABASE_URL` for the API) |
| **`JWT_SECRET`** | At least 32 random characters for JWT signing (e.g. `openssl rand -hex 32`) |
| **`RUSTFS_ROOT_PASSWORD`** | MinIO root password (`RUSTFS_ROOT_USER` defaults to `submify` if unset) |

Optional: export overrides in your shell instead of `.env`, or add **`ALLOWED_ORIGINS`**, **`AUTH_COOKIE_SECURE`**, etc. (see [Configuration](#configuration-and-environment-variables)).

```bash
# Optional one-liners when not using .env for these
export ALLOWED_ORIGINS="http://localhost:2512,https://yourdomain.com"
```

**`TUNNEL_TOKEN`** is only needed if you use the **`tunnel`** Compose profile ([Cloudflare Tunnel](#optional-cloudflare-tunnel)).

### 3. Start the stack

```bash
docker compose up --build -d
docker compose ps
```

### 4. Open the app

See **[URLs and ports (browser vs containers)](#urls-and-ports-browser-vs-containers)** below for the full picture.

### 5. View logs

```bash
docker compose logs -f api
docker compose logs -f nginx
```

### 6. Quick redeploy (pull latest code, rebuild, clean old images, watch API logs)

On a server where you cloned the repo to `~/Submify`, use this copy-paste sequence after changes are pushed to Git. Ensure **`.env`** exists (see [§2](#2-environment-file-required-before-first-boot)); **`git pull` does not create it**.

```bash
cd ~/Submify
git pull
docker compose up --build -d
chmod +x scripts/prune-docker.sh
./scripts/prune-docker.sh
docker compose logs --tail 3000 -f api
```

**Cleanup step (`prune-docker.sh`):** Removes unused Docker images and build cache so repeated rebuilds do not fill the disk. It does **not** delete volumes or your bind-mounted data — PostgreSQL submissions and MinIO files under `/var/lib/submify/data/` stay intact. Do **not** run `docker volume prune` or `docker system prune --volumes` unless you intend to wipe data (see **[Disk after many rebuilds](#operations-logs-backup-updates)**).

**Logs:** `--tail 3000` limits how much **existing** log history is printed when you attach; new lines still stream until you press **Ctrl+C**. For a one-off snapshot without following, use `docker compose logs --tail 3000 api` (no `-f`).

Omit the `prune` and/or `logs` lines if you only need a quick pull and rebuild.

---

## URLs and ports (browser vs containers)

Use the **host** machine’s address (your VPS IP, `localhost` on the same box, or your domain if DNS points here). **Nginx** is the only service that publishes a port in the default `docker-compose.yml`: **2512**.

### What you use in the browser (host)

| What | URL |
|------|-----|
| **Web UI** (Next.js dashboard) | `http://<your-server-ip>:2512` — e.g. `http://localhost:2512` on the same machine |
| **API** | Same host, under **`/api/v1`** — e.g. `http://<your-server-ip>:2512/api/v1` |

You **do not** open port **8080** on the host for normal use. **2512** is the public entrypoint (on **nginx**).

### Why API logs say `:8080`

`submify api listening on :8080` refers to the **inside** of the `submify-api` container. Traffic flow:

`Browser → :2512 (nginx) → /api/… → api:8080` and `… → / → web:3000`.

### Quick checks

- **Dashboard:** `http://YOUR_IP:2512`
- **Health:** `http://YOUR_IP:2512/api/v1/system/health`
- **API base** for clients and forms: `http://YOUR_IP:2512/api/v1` (or `https://…` if you terminate TLS in front)

### Firewall

Allow **TCP 2512** from the networks that should reach the UI/API. If you put HTTPS on **80** or **443** in front of this stack, allow those instead (or in addition).

---

## Configuration and environment variables

Values used by the **API** container (see `docker-compose.yml` and `apps/api/internal/config/config.go`):

| Variable | Default (if unset) | Meaning |
|----------|----------------------|---------|
| `PORT` | `8080` | HTTP port inside the API container |
| `DATABASE_URL` | Compose default to `db` | PostgreSQL connection string |
| `JWT_SECRET` | Set in **`.env`** (required by Compose) | JWT HMAC secret (≥32 random characters recommended) |
| `ALLOWED_ORIGINS` | `http://localhost:2512,http://127.0.0.1:2512` | CORS allowlist (comma-separated) |
| `UPLOAD_MAX_SIZE_BYTES` | `26214400` (25 MiB) | Max upload size for presign |
| `UPLOAD_ALLOWED_MIME` | `image/png,image/jpeg,application/pdf,text/plain` | Allowed MIME types for presign |
| `PRESIGN_EXPIRY_MINUTES` | `10` | Presigned URL lifetime |
| `ACCESS_TOKEN_TTL_MINUTES` | `30` | Access token lifetime |
| `REFRESH_TOKEN_TTL_HOURS` | `168` | Refresh token lifetime |
| `POSTGRES_PASSWORD` | Set in **`.env`** (required; no Compose default) | DB password; Compose interpolates this into `DATABASE_URL` for the API |
| `TRUSTED_PROXIES` | private RFC1918 + loopback | CIDRs allowed to set `X-Forwarded-For` (trust Nginx / load balancers only) |
| `RATE_LIMIT_SENSITIVE_PUBLIC_RPM` | `25` | Login / setup / refresh / logout per IP |
| `RATE_LIMIT_SUBMIT_IP_RPM` | `90` | Public submit per client IP |
| `RATE_LIMIT_SUBMIT_KEY_RPM` | `180` | Public submit per API key (path + header) |
| `RATE_LIMIT_AUTH_USER_RPM` | `600` | Authenticated API per user id |

**Web** container:

| Variable | Typical value | Meaning |
|----------|----------------|---------|
| `NEXT_PUBLIC_API_BASE` | `/api/v1` | Browser-side API prefix (relative URL works behind Nginx) |
| `NODEDR_SUBMIT_PUBLIC_KEY` | _(empty or `pk_…`)_ | Optional: server-side key for the marketing contact form proxy (`/api/contact-submit`) |
| `NODEDR_SUBMIT_SECRET_KEY` | _(empty or `sk_…`)_ | Optional: HMAC signing for that upstream request; never commit real values |

---

## First-time access

On first launch, create your first account via **`/register`** (or API `POST /api/v1/auth/register`).

After setup:

1. Log in at **`/login`**
2. Open **Dashboard** — your **form API key** is shown there (a **Default** inbox project is created for you automatically)
3. Use that **`api_key`** on every website integration (see [Connecting a client website](#connecting-a-client-website-forms)); add more **Projects** only if you want separate legacy ingest keys or organization

**S3 note:** JSON submissions work without S3. Configure S3 per project only when you need presigned uploads.

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
| Health | GET | `/api/v1/system/health` | None |
| Auth | POST | `/api/v1/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | None |
| Submit | POST | `/api/submit` | Header `x-api-key` (project public key) |
| Projects | GET, POST | `/api/v1/projects` | Bearer |
| Project | PATCH | `/api/v1/projects/{id}` | Bearer |
| Submissions | GET | `/api/v1/projects/{id}/submissions` | Bearer |
| Bulk delete | DELETE | `/api/v1/projects/{id}/submissions/bulk` | Bearer |
| Presign | POST | `/api/v1/uploads/presign` | Bearer |
| Export | GET | `/api/v1/projects/{id}/export?format=xlsx|pdf` | Bearer |

---

## Connecting a client website (forms)

### 1. Get your API key

After login, open **Projects** and copy a project public key (`pk_live_...`). Use it as `x-api-key` when posting to `/api/submit`.

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
const API_KEY = "<your account api_key from dashboard>";
const SUBMIT_URL = "https://your-submify-host:2512/api/submit";

await fetch(SUBMIT_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
  },
  body: JSON.stringify({
    data: { name: "Jane", email: "jane@example.com", message: "Hi" },
    files: []
  })
});
```

### 5. Example: Next.js server action / route (keeps key out of client if you proxy)

You can call Submify from **your** backend with the same `POST /submit/{key}` contract so the **api_key** never ships to the browser (implement a route that forwards the body).

### 5b. Next.js marketing contact form (Nodedr hosted API proxy)

This repository’s **Next.js app** (`apps/web`) includes an optional **contact form** that posts to a **Route Handler**, which forwards to **`https://api.nodedr.com/api/submit`** with **`x-api-key`** (and optional **`x-signature`** HMAC when `NODEDR_SUBMIT_SECRET_KEY` is set). Keys stay **server-side** — never use `NEXT_PUBLIC_*` for them.

**Using an AI coding assistant (Cursor, Copilot, ChatGPT, etc.)?** Copy the **prompt you can reuse in chat** below (or the same block under **`/docs/contact-proxy`**, **main `/docs`**, or **Projects** in the web UI). Replace `[path/to/site-folder]` with your app path. **In this monorepo** the Next.js proxy is already at **`/api/contact-submit`** because **`POST /api/submit`** is reserved for the **Go** API—if you paste the generic prompt verbatim into an assistant, tell it to use **`/api/contact-submit`** for the Route Handler and `fetch` path here, or you can break nginx routing.

#### Prompt you can reuse in chat

Copy and adjust the bracketed parts:

````text
Prompt you can reuse in chat
Copy and adjust the bracketed parts:

In this repo's Next.js App Router site at [path/to/site-folder], implement contact form submission using the Nodedr submit API proxy pattern (same as SeattleDrainCleaningCo), not FormSubmit in the browser.
Requirements:
1. Add `src/app/api/submit/route.ts` that accepts POST JSON, validates with a shared Zod schema (honeypot field e.g. gotcha must be empty), builds the upstream JSON payload, and POSTs to `https://api.nodedr.com/api/submit` with `Content-Type: application/json`, header `x-api-key` set from server env (`NODEDR_SUBMIT_PUBLIC_KEY` or `NODEDR_PUBLIC_KEY`, value must be `pk_...`). If `NODEDR_SUBMIT_SECRET_KEY` (`sk_...`) is set, add `x-signature`: hex HMAC-SHA256 of the exact UTF-8 body string you send upstream.
2. Add `src/lib/nodedrSubmitEnv.ts` (or equivalent) that reads those env vars at runtime (no `NEXT_PUBLIC_` for secrets).
3. Add `src/lib/contactSubmitSchema.ts` shared between client and route; export the inferred type.
4. Wire the contact form(s) to `fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...fields, gotcha }) })`, show inline success/error, never expose keys to the client.
5. Ensure CSP `connect-src` allows `'self'` for this fetch if the project uses CSP.
6. Document env vars in `.env.example` (public key name only as a placeholder; never commit real `sk_`).
Follow `f:/code/.cursor/rules/15-formsubmit-and-contact-forms.mdc` (Nodedr submit API section) and match file layout/naming to SeattleDrainCleaningCo unless this site's structure differs—then adapt minimally.
That gives a future session enough context to recreate the pattern without re-explaining it.
````

| Item | Location |
|------|----------|
| Route handler | `apps/web/app/api/contact-submit/route.ts` |
| Env template | `apps/web/.env.example` |
| Docker / Compose | `NODEDR_SUBMIT_PUBLIC_KEY` / `NODEDR_SUBMIT_SECRET_KEY` on the **`web`** service (see `docker-compose.yml`) |
| Nginx | `location /api/contact-submit` → **web** (before `/api/` → Go), so this path does not collide with **`POST /api/submit`** on the API |
| Full guide + copy-paste prompt | **`/docs/contact-proxy`** in the web app (see *Next.js Nodedr contact proxy* in the docs header) |

Static assets for the UI (e.g. logo under `apps/web/public/`) are **copied into the production image** — see `apps/web/Dockerfile` (`COPY ... /app/public`).

### 6. Rate limits

Limits are **tiered** so dashboard users are not punished by anonymous/IP caps:

- **`GET /system/bootstrap-status`** and **`GET /system/health`**: no API rate limit (use WAF/monitoring in production if needed).
- **Login / refresh / logout / setup**: per **client IP** (default **25/min**; `RATE_LIMIT_SENSITIVE_PUBLIC_RPM`).
- **`POST /submit`**: per **IP** and per **API key** (defaults **90/min** and **180/min**; `RATE_LIMIT_SUBMIT_IP_RPM`, `RATE_LIMIT_SUBMIT_KEY_RPM`).
- **All Bearer-authenticated routes**: per **user id** (default **600/min**; `RATE_LIMIT_AUTH_USER_RPM`).

Nginx forwards `X-Forwarded-For`; the API uses **`TRUSTED_PROXIES`** (CIDR list) so client IPs are derived safely. Tune env vars in `docker-compose.yml` if legitimate traffic hits `429`.

---

## Presigned uploads (optional)

1. Authenticated user calls **`POST /api/v1/uploads/presign`** with `project_id`, `filename`, `content_type`, `size`.
2. Response contains **`upload_url`** (HTTP PUT) and **`object_key`**.
3. Client **`PUT`**s the file bytes to **`upload_url`**.
4. Reference **`object_key`** (or your own metadata) inside submission JSON under **`files`** as your app requires.

MIME types and max size are enforced server-side (`UPLOAD_ALLOWED_MIME`, `UPLOAD_MAX_SIZE_BYTES`).

---

## Dashboard workflow

1. Log in  
2. Copy your **account form API key** from the dashboard (one key for all sites)  
3. Point website forms at **`POST /api/v1/submit/{api_key}`** with matching **`x-api-key`**  
4. Review submissions (default inbox under **Default** project; optional extra projects for separation)  
5. Export **XLSX** or **PDF**; use **bulk delete** to stay under the per-project cap  

---

## Limits and security defaults

| Item | Value |
|------|--------|
| Submissions per project | **5000** (then `429`) |
| Password hashing | **Argon2id** |
| JWT | Access + refresh; Bearer auth for dashboard APIs |
| Rate limit | Tiered: see [Connecting → Rate limits](#6-rate-limits); authed users limited **per account**, not shared 10/min/IP |
| Tenant isolation | Project ownership checked on authenticated routes |

Use **HTTPS** in production. The **account `api_key`** is meant to be embedded in public sites (like a reCAPTCHA site key — not a secret admin password). If it leaks, plan to add a **rotate key** feature or re-provision the account; project-level keys can be rotated from **Projects** today.

---

## Operations: logs, backup, updates

**Logs:** `docker compose logs -f [service]` (e.g. `docker compose logs -f api` or `nginx`)

**Pull latest code, rebuild, prune old images, and follow API logs** (same as **Installation → Quick redeploy**):

```bash
cd ~/Submify
git pull
docker compose up --build -d
chmod +x scripts/prune-docker.sh
./scripts/prune-docker.sh
docker compose logs --tail 3000 -f api
```

Adjust `~/Submify` if your clone lives elsewhere. The prune script only clears unused images/cache — **not** submission data (see comments in `scripts/prune-docker.sh`).

**Backups:** Persisted data (see `docker-compose.yml`):

- `/var/lib/submify/data/postgres`
- `/var/lib/submify/data/rustfs`

Back up these directories on a schedule appropriate to your RPO/RTO.

**Log size:** Services use Docker’s **`json-file`** driver with rotation configured in `docker-compose.yml`. The **`api`** container uses **10 MB** per file, **1** file (`x-logging-api`). Other services use **10 MB** × **3** files (`x-logging`) unless you change them. Docker measures **bytes**, not lines.

**Disk after many rebuilds:** New `docker compose up --build` layers live in Docker’s image/build cache, **not** in PostgreSQL. They can fill the host disk over time. Run periodically:

```bash
chmod +x scripts/prune-docker.sh
./scripts/prune-docker.sh
```

Or add a weekly cron job (see comments in the script). The script runs `docker builder prune` and `docker system prune` / `docker image prune` — it does **not** remove volumes or your bind-mounted DB paths. Never run `docker volume prune` or `docker system prune --volumes` unless you intend to delete data.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Compose error: `required variable POSTGRES_PASSWORD is missing` (or similar for `JWT_SECRET` / `RUSTFS_ROOT_PASSWORD`) | Create **`.env`** in the repo root: `cp .env.example .env` or `./scripts/setup-env.sh`, then set real secrets |
| `docker compose build` / bake **exit status 1** | Run **`docker compose build --progress=plain api`** (or **`web`**) and read the **ERROR** block at the end. On a **small VPS**, parallel builds can OOM — try **`docker compose build --parallel 1`** or add **swap** |
| Nothing on port 2512 | Firewall, `docker compose ps`, Nginx logs |
| Setup loop | DB healthy, API logs, `system_configs` row |
| `401` on submit | `x-api-key` equals URL segment and matches a valid **`api_key`** or project **`public_api_key`** |
| `429` on submit | Per-project **5000** cap, or submit IP/key rate limits |
| CORS errors from browser | `ALLOWED_ORIGINS` includes your site’s exact origin (scheme + host + port) |
| S3 degraded in health | Expected with placeholder S3; fix credentials in Settings |

---

## Codebase review (health check)

Review performed against the code in this repository (handlers, routes, Next.js **proxy** (edge routing), Compose, Nginx):

| Area | Assessment |
|------|------------|
| Routes vs [docs/api.md](docs/api.md) | Aligned with `apps/api/internal/httpapi/server.go` |
| Submit auth | URL segment and `x-api-key` must match; key resolves to **user** (default inbox) or **project** (legacy) |
| Secured routes | `SetupGuard` + `AuthGuard` + ownership checks on project-scoped handlers |
| Nginx | `/api/` → API, `/` → web; `client_max_body_size 30M` |
| Frontend API | `apps/web/lib/api.ts` uses `NEXT_PUBLIC_API_BASE` default `/api/v1` |
| Module path | Go module is `github.com/nodedr/submify/apps/api` (forks keep import paths or use replace directives if forking internals) |

### Bugs found and fixed

| File | Bug | Fix |
|------|-----|-----|
| `apps/api/internal/telegram/telegram.go` | **Compile error** — `err` from `if err := send(...)` was scoped inside the `if` block but referenced on the next line outside it | Separated `err := send(...)` from the `if` so `err` is in scope for the log line |
| `apps/api/internal/auth/password.go` | **Login always fails** — `HashPassword` produces 5 `$`-delimited parts but `VerifyPassword` expected 6 parts and read salt/hash from wrong indices | Changed verify to expect 5 parts and read salt from `parts[3]`, hash from `parts[4]` |
| `apps/api/Dockerfile` | **Build fails** — `go build -o /out/...` without **`/out`** existing; empty **`GOARCH`** when platform args are missing | **`mkdir -p /out`** before build; **`ARG TARGETARCH=amd64`** in the builder stage; `go mod tidy` + `go build` after **`COPY . .`** |
| `apps/api/internal/httpapi/handlers.go` | **Compile error** with **`github.com/golang-jwt/jwt/v5`** — `NumericDate` exposes **`Time`** as a field | Use **`claims.ExpiresAt.Time`** (not **`Time()`**) when reading expiry |
| `.gitignore` | **`.env.example`** was ignored by **`.env.*`**, so clones had no Compose template | Un-ignore **`!.env.example`** / **`!**/.env.example`**; track root + **`apps/web/.env.example`** |
| `apps/web` (Next.js) | **`proxy.ts` never ran** — only **`middleware.ts`** with **`export function middleware`** is executed at the app root | Use **`middleware.ts`** (removed misnamed **`proxy.ts`**) |
| `apps/web/Dockerfile` | **Build fails** — `COPY /app/public` fails because no `public/` directory exists in the project | Replaced with `RUN mkdir -p ./public` |
| `docker-compose.yml` | **Warning** — obsolete `version: '3.9'` attribute | Removed |
| `apps/web/app/export/page.tsx` | **Exports always 401** — `window.open()` cannot send `Authorization` header | Replaced with `fetch()` + Blob download that sends the Bearer token |

**Operational notes:**

- **Tenant isolation:** one PostgreSQL database with strict `user_id` / `project_id` checks on every mutating and listing path; another user’s JWT cannot read their rows.
- **Persistence:** Postgres files live in the **host bind mount** (`/var/lib/submify/data/postgres` in the default Compose file), not in the API image — restarts keep data. Use a strong **`POSTGRES_PASSWORD`** in production.
- Rate limits are **tiered** (health/bootstrap exempt; authed traffic per **user**). Adjust env vars if you still see `429` for legitimate load.
- Run `go test ./...` under `apps/api` to execute unit tests for password hashing, JWT, etc.

---

## License

This project is licensed under **Business Source License 1.1** — see [LICENSE](LICENSE).

---

## Developer & Ownership

Submify is made by **NODEDR PRIVATE LIMITED**.

- **Lead Developer & Founder:** **RAKTIM RANJIT**
- **Company:** NODEDR PRIVATE LIMITED
- **Website:** [www.nodedr.com](https://www.nodedr.com)

---

## Links

- Repository: [https://github.com/Raktim94/Submify.git](https://github.com/Raktim94/Submify.git)
- API detail: [docs/api.md](docs/api.md)
- Deployment shortcuts: [docs/deployment.md](docs/deployment.md)
- **AI builders:** Nodedr contact-proxy **copy-paste prompt** (in the running web app): `/docs/contact-proxy` → *For AI builders* / *Reuse prompt* (see [§5b](#5b-nextjs-marketing-contact-form-nodedr-hosted-api-proxy))
