# Submify

Submify is a self-hosted **Form Backend as a Service (FBaaS)** stack: a Go (Gin) API, Next.js dashboard, PostgreSQL, S3-compatible object storage (**MinIO** by default), and Nginx as a single entrypoint.

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
- **Object storage (MinIO)** — by default the stack runs **`minio/minio`** (S3-compatible API). MinIO data is stored under **`./data/rustfs`** next to `docker-compose.yml` (portable bind mounts).

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

- **Linux/macOS/Windows host** with admin access (on Linux, a sudo-capable user)
- **Docker Engine** and **Docker Compose** (v2 plugin)
- Host firewall / security group allowing inbound **TCP 2512** (or your reverse proxy port)
- For production: TLS termination (reverse proxy or tunnel) is strongly recommended

**Note:** Default Compose uses **`./data/postgres`** and **`./data/rustfs`** (next to the compose file) so the stack runs on **Windows, macOS, Linux, and CasaOS-style installs** without creating `/var/lib/...` paths. For a Linux VPS you can edit those volume lines to absolute host paths if you prefer.

---

## Before you install (host prep)

Run these checks before cloning and starting Submify.

### Linux (recommended for servers)

1. Install Docker Engine and Compose plugin (official Docker docs for your distro).
2. Verify install:
   - `docker --version`
   - `docker compose version`
3. Add your user to the `docker` group (so you can run Docker without `sudo` each time):
   - `sudo usermod -aG docker $USER`
   - Re-login (or reboot) so group membership is applied.
4. If you do not add your user to the `docker` group, run Docker commands with `sudo`.
5. Keep a sudo-capable account for system operations (updates, firewall, backup, service management).

### Windows / macOS

1. Install Docker Desktop.
2. Ensure Docker Desktop is running.
3. Verify:
   - `docker --version`
   - `docker compose version`

---

## Installation (Docker Compose)

### 1. Clone

```bash
git clone https://github.com/Raktim94/Submify.git
cd Submify
```

### 2. Environment and secrets

**Default:** no `.env` is required. Startup wrappers auto-create **`.env.auto`** with strong random values for **`POSTGRES_PASSWORD`**, **`JWT_SECRET`**, and **`RUSTFS_ROOT_PASSWORD`** on first run. You can still override with `.env` (see `.env.example`).

| File | Role |
|------|------|
| **`.env`** (optional) | Overrides — copy from **`.env.example`** (`./scripts/setup-env.sh`) |
| **`.env.auto`** (auto-generated) | Strong random secrets created automatically by wrapper scripts; back up with **`./data/`** |
| **`apps/web/.env.example`** | Optional Next.js / marketing contact-proxy vars (see [§5b](#5b-nextjs-marketing-contact-form-nodedr-hosted-api-proxy)) |

**Wrapper scripts** (`./scripts/compose-up.sh`, **`Compose-Up.ps1`**) add **`--env-file`** entries when **`.env.auto`** and/or **`.env`** exist.

```bash
# Optional one-liners when not using .env for these
export ALLOWED_ORIGINS="http://localhost:2512,https://yourdomain.com"
```

**`TUNNEL_TOKEN`** is only needed if you use the **`tunnel`** Compose profile ([Cloudflare Tunnel](#optional-cloudflare-tunnel)).

### 3. Start the stack

```bash
./scripts/compose-up.sh up --build -d
docker compose ps
```

Windows:

```powershell
.\scripts\Compose-Up.ps1 up --build -d
```

### 3b. Recovering data after path or password changes

If you previously used **`/var/lib/submify/data/...`** or an old **`.env`**, your files may still be on disk. **Stop the stack**, copy the old Postgres data directory into **`./data/postgres`**, and set **`POSTGRES_PASSWORD`** in **`.env`** to the **same** value used when that database was first initialized. If you regenerated **`.env.auto`** or defaults no longer match the volume, Postgres will reject connections until the password matches.

### 4. Open the app

See **[URLs and ports (browser vs containers)](#urls-and-ports-browser-vs-containers)** below for the full picture.

### 5. View logs

```bash
docker compose logs -f api
docker compose logs -f nginx
```

### 6. Quick redeploy (pull latest, rebuild, prune)

Use this after new commits land in your upstream branch. **`git pull`** updates code only — it does **not** replace **`./data/`** or your **`.env`** / **`.env.auto`** (keep those on the server).

**1. Go to your clone and pull**

Always reset **`scripts/prune-docker.sh`** to the last committed version **before** **`git pull`** (servers often pick up stray edits; this step is harmless when the file is clean):

```bash
cd /path/to/Submify   # e.g. ~/Submify on Linux
git checkout -- scripts/prune-docker.sh && git pull
```

Same thing: **`./scripts/pull-latest.sh`** (runs that checkout, then **`git pull`**).

**2. Rebuild and restart the stack** (defaults in `docker-compose.yml`; optional **`.env`** / **`.env.auto`** are picked up automatically from the project directory)

```bash
docker compose up --build -d
```

If you start Compose via **`./scripts/compose-up.sh`**, use the same wrapper here so **`--env-file`** stays consistent:

```bash
./scripts/compose-up.sh up --build -d
```

**3. Prune old images and build cache** (optional; saves disk — safe for **`./data/`**)

```bash
sh ./scripts/prune-docker.sh
```

(`sh` avoids “Permission denied” when the file is not marked executable; after **`git pull`**, the repo should ship **`scripts/prune-docker.sh`** as executable — if yours is not, run **`chmod +x scripts/prune-docker.sh`** once, or always use **`sh ./scripts/prune-docker.sh`**.)

**4. (Optional) Watch API logs**

Do **not** chain this after deploy with **`&&`** unless you understand: **`docker compose logs -f`** **follows** the log stream and **does not exit** until you press **Ctrl+C** — the shell is waiting for new lines, not frozen.

```bash
docker compose logs --tail 3000 -f api
```

- **`-f`** = follow live logs (runs until **Ctrl+C**).
- **No `-f`** = print recent lines and return to the prompt: `docker compose logs --tail 300 api`

**All-in-one that finishes** (returns to shell when done — recommended for copy-paste deploys):

```bash
cd ~/Submify && git checkout -- scripts/prune-docker.sh && git pull && docker compose up --build -d && sh ./scripts/prune-docker.sh
```

Then, only if you want to watch logs, run this **as a second command**:

```bash
docker compose logs --tail 3000 -f api
```

*(If you skip `git checkout -- scripts/prune-docker.sh` and have any local change to that file, **`git pull` will abort**.)*

**Windows (PowerShell, Docker Desktop):** `cd` to your clone, then **`git checkout -- scripts/prune-docker.sh && git pull`**, then **`docker compose up --build -d`**. For **`prune-docker.sh`**, use **Git Bash**: `sh ./scripts/prune-docker.sh`. Logs: same **`docker compose logs …`** as above. Use **[Disk after many rebuilds](#operations-logs-backup-updates)** when the disk fills.

Omit step 3 if you only need a quick pull and rebuild.

---

## URLs and ports (browser vs containers)

Use the **host** machine’s address (your VPS IP, `localhost` on the same box, or your domain if DNS points here). **Nginx** is the only service that publishes a port in the default `docker-compose.yml`: **2512**, bound to `127.0.0.1` by default.

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
| `JWT_SECRET` | Built-in default in **`docker-compose.yml`**, or **`.env`** / **`.env.auto`** | JWT HMAC secret (≥32 characters; override in production) |
| `ALLOWED_ORIGINS` | `http://localhost:2512,http://127.0.0.1:2512` | CORS allowlist (comma-separated) |
| `UPLOAD_MAX_SIZE_BYTES` | `26214400` (25 MiB) | Max upload size for presign |
| `UPLOAD_ALLOWED_MIME` | `image/png,image/jpeg,application/pdf,text/plain` | Allowed MIME types for presign |
| `PRESIGN_EXPIRY_MINUTES` | `10` | Presigned URL lifetime |
| `ACCESS_TOKEN_TTL_MINUTES` | `30` | Access token lifetime |
| `REFRESH_TOKEN_TTL_HOURS` | `24` | Refresh token lifetime |
| `POSTGRES_PASSWORD` | Built-in default in **`docker-compose.yml`**, or **`.env`** / **`.env.auto`** | DB password; must match **`DATABASE_URL`** in the API service |
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
| Security | PUT | `/api/v1/users/me/password` | Bearer |
| Security | POST | `/api/v1/users/me/api-key/rotate` | Bearer |
| Security | POST | `/api/v1/users/me/projects/rotate-keys` | Bearer |

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

### MinIO: what it does in Submify

Submify stores normal form JSON in PostgreSQL. **MinIO** is used only as **file/object storage** for large uploads via presigned URLs.

- Without MinIO: submissions still work (JSON-only).
- With MinIO: users upload large files directly to object storage, then store file references in submissions.

In short: PostgreSQL = form data, MinIO = file objects.

### MinIO quick setup (first time)

1. Start the stack:
   - Linux/macOS: `./scripts/compose-up.sh up -d`
   - Windows: `.\scripts\Compose-Up.ps1 up -d`
2. Generate a strong root password for MinIO:
   - Linux/macOS: `openssl rand -base64 32`
   - PowerShell: `[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}))`
3. Set `RUSTFS_ROOT_PASSWORD` in `.env` (or let `.env.auto` manage it), then restart the stack.
4. Open MinIO Console in browser (default): `http://127.0.0.1:9001`
5. Login using:
   - Username: value of `RUSTFS_ROOT_USER` (default `submify`)
   - Password: value of `RUSTFS_ROOT_PASSWORD`
6. Create a bucket for uploads (for example `submify-uploads`).
7. Create an access key / secret key in MinIO (recommended: dedicated credentials for Submify app use).

### Configure Submify Settings for file upload

Open **Settings** (or Project-level storage in **Projects**) and set:

- `s3_endpoint`: MinIO internal endpoint (default in this Compose stack: `http://rustfs:9000`)
- `s3_bucket`: your bucket name (for example `submify-uploads`)
- `s3_access_key`: MinIO access key
- `s3_secret_key`: MinIO secret key

### Client-side upload flow (correct way)

1. Your app calls `POST /api/v1/uploads/presign` with:
   - `project_id`
   - `filename`
   - `content_type`
   - `size`
2. Submify returns:
   - `upload_url` (one-time/short-lived PUT URL)
   - `object_key`
3. Browser/client uploads bytes directly to `upload_url` with HTTP PUT.
4. Your app sends normal `POST /api/submit` and includes `object_key` in `files` metadata.

Minimal client example:

```javascript
const presign = await fetch('/api/v1/uploads/presign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    project_id: projectId,
    filename: file.name,
    content_type: file.type,
    size: file.size
  })
}).then((r) => r.json());

await fetch(presign.upload_url, {
  method: 'PUT',
  headers: { 'Content-Type': file.type },
  body: file
});
```

### Security best practices for MinIO

- Never expose `s3_secret_key` in frontend/public JavaScript.
- Use separate MinIO credentials per environment (dev/stage/prod).
- Rotate MinIO root and app credentials regularly.
- Keep MinIO endpoint private (internal Docker network), expose only via controlled proxy if needed.
- Back up both `./data/rustfs` and `./data/postgres`.

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

Use **HTTPS** in production. The **account `api_key`** is meant to be embedded in public sites (like a reCAPTCHA site key — not a secret admin password). If it leaks, rotate it from **Settings** immediately. Project-level keys can be rotated per project in **Projects** or all at once from **Settings**.

### Security controls available in Settings

- Change account login password
- Rotate account API key (invalidates old key immediately)
- Rotate all project keys in one action (invalidates all old project public/secret keys)
- Update S3/MinIO credentials used for presigned uploads
- Save host bind/port preferences with copy-paste restart command

#### How to use the Settings page (quick workflow)

1. Open `Settings` from the top navigation.
2. **Login password**: enter current password + new password + confirmation, then click **Update password**.
3. **API key rotation**:
   - Click **Rotate account API key** if your public key is exposed.
   - Click **Rotate all project keys** if you suspect broader leakage.
4. **S3-compatible storage**:
   - Set `s3_endpoint`, `s3_bucket`, `s3_access_key`, `s3_secret_key`.
   - For Docker Compose defaults, use the MinIO internal endpoint (`http://rustfs:9000`).
5. **Port/bind preference**:
   - Keep `127.0.0.1:2512` for Cloudflare Tunnel/local-only exposure.
   - Use the shown command to apply and restart.

### MinIO root password rotation (important)

`RUSTFS_ROOT_PASSWORD` is an infrastructure-level runtime secret in Docker/Compose, so it is intentionally **not** changed from the web UI.

Safe rotation flow (recommended):

1. Update `RUSTFS_ROOT_PASSWORD` in `.env` (or `.env.auto` if you use generated secrets).
2. Restart stack: `./scripts/compose-up.sh up -d` (Linux/macOS) or `.\scripts\Compose-Up.ps1 up -d` (PowerShell).
3. If your S3 access/secret pair also changed, update them in Submify Settings/Projects.
4. Verify health endpoint returns OK: `/api/v1/system/health`.
5. Test one presigned upload to confirm storage credentials and bucket permissions are still correct.

Windows PowerShell example:

```powershell
$env:RUSTFS_ROOT_PASSWORD='your-new-strong-password'
.\scripts\Compose-Up.ps1 up -d
```

Linux/macOS example:

```bash
export RUSTFS_ROOT_PASSWORD='your-new-strong-password'
./scripts/compose-up.sh up -d
```

---

## Operations: logs, backup, updates

**Logs:** `docker compose logs -f [service]` (e.g. `api` or `nginx`).

**Pull, rebuild, prune:** use **[Installation → §6 Quick redeploy](#6-quick-redeploy-pull-latest-rebuild-prune)** — **`git checkout -- scripts/prune-docker.sh && git pull`**, then **`docker compose up --build -d`**, optional **`sh ./scripts/prune-docker.sh`**. Run **`docker compose logs -f api`** separately if you want live logs (**`-f`** streams until **Ctrl+C**). If you deploy with **`./scripts/compose-up.sh`**, substitute **`./scripts/compose-up.sh up --build -d`** for **`docker compose up --build -d`** so env files stay aligned.

The prune script only clears unused images/cache — **not** **`./data/`** (see `scripts/prune-docker.sh`).

**Backups:** Persisted data (see `docker-compose.yml`):

- `./data/postgres`
- `./data/rustfs`

Back up these directories on a schedule appropriate to your RPO/RTO.

**Log size:** Services use Docker’s **`json-file`** driver with rotation configured in `docker-compose.yml`. The **`api`** container uses **10 MB** per file, **1** file (`x-logging-api`). Other services use **10 MB** × **3** files (`x-logging`) unless you change them. Docker measures **bytes**, not lines.

**Disk after many rebuilds:** New `docker compose up --build` layers live in Docker’s image/build cache, **not** in PostgreSQL. They can fill the host disk over time. Run periodically:

```bash
sh ./scripts/prune-docker.sh
```

Or add a weekly cron job (see comments in the script; use the full path and **`sh`**, or **`chmod +x`** and **`./scripts/prune-docker.sh`**). The script runs `docker builder prune` and `docker system prune` / `docker image prune` — it does **not** remove volumes or your bind-mounted DB paths. Never run `docker volume prune` or `docker system prune --volumes` unless you intend to delete data.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| API exits: **`JWT_SECRET` must be set…** | With **`GIN_MODE=release`**, the secret must be ≥32 characters. Set **`JWT_SECRET`** in **`.env`** or run via **`./scripts/compose-up.sh`** so **`.env.auto`** supplies one |
| Postgres auth errors after an upgrade or new **`.env.auto`** | **`POSTGRES_PASSWORD`** no longer matches the cluster on disk. Restore the old password in **`.env`**, or start from a fresh **`./data/postgres`** only if you accept losing DB contents |
| **`Permission denied`** running **`./scripts/prune-docker.sh`** | Run **`sh ./scripts/prune-docker.sh`** (no execute bit needed), or **`chmod +x scripts/prune-docker.sh`**. New clones should get **`+x`** from Git after **`git pull`** |
| Redeploy “hangs” after **`docker compose logs -f`** | **`-f`** follows logs until **Ctrl+C** — not stuck. Omit **`-f`** for a one-shot dump, or run logs **after** the deploy command instead of **`&&`** chaining |
| `docker compose build` / bake **exit status 1** | Run **`docker compose build --progress=plain api`** (or **`web`**) and read the **ERROR** block at the end. On a **small VPS**, parallel builds can OOM — try **`docker compose build --parallel 1`** or add **swap** |
| Nothing on port 2512 | Firewall, `docker compose ps`, Nginx logs |
| Locked out after recreating **`.env.auto`** but keeping old DB data | Restore the previous **`.env.auto`** (or reset Postgres / MinIO data to match new secrets) |
| `401` on submit | `x-api-key` equals URL segment and matches a valid **`api_key`** or project **`public_api_key`** |
| `429` on submit | Per-project **5000** cap, or submit IP/key rate limits |
| CORS errors from browser | `ALLOWED_ORIGINS` includes your site’s exact origin (scheme + host + port) |
| S3 degraded in health | Expected with placeholder S3; fix credentials in Settings |

---

## Codebase review (health check)

Review performed against the code in this repository (handlers, routes, Next.js **redirects** in `next.config.js`, Compose, Nginx):

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
| `apps/web` (Next.js) | Edge **`middleware.ts`** is easy to confuse with deprecated Next conventions | **`/setup` → `/register`** via **`next.config.js` `redirects`** (no middleware file) |
| `apps/web/Dockerfile` | **Build fails** — `COPY /app/public` fails because no `public/` directory exists in the project | Replaced with `RUN mkdir -p ./public` |
| `docker-compose.yml` | **Warning** — obsolete `version: '3.9'` attribute | Removed |
| `apps/web/app/export/page.tsx` | **Exports always 401** — `window.open()` cannot send `Authorization` header | Replaced with `fetch()` + Blob download that sends the Bearer token |

**Operational notes:**

- **Tenant isolation:** one PostgreSQL database with strict `user_id` / `project_id` checks on every mutating and listing path; another user’s JWT cannot read their rows.
- **Persistence:** Postgres files live in **`./data/postgres`** (next to `docker-compose.yml`), not in the API image — restarts keep data. Use unique secrets in production via **`.env`**.
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
