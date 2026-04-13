# Submify v1 API Contract

**Base path:** `/api/v1`  
**Full URL example:** `https://your-host:2512/api/v1` (behind Nginx in Docker)

All JSON bodies use `Content-Type: application/json` unless noted.

**Rate limiting** (all return `429` with a JSON `error` string):

| Scope | Default (env) | Notes |
|-------|----------------|-------|
| `GET /system/bootstrap-status`, `GET /system/health` | *unlimited* | Monitoring / first-load friendly |
| `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/system/setup` | `25` RPM / IP | `RATE_LIMIT_SENSITIVE_PUBLIC_RPM` — slows brute force |
| `POST /submit/...` | `90` RPM / IP **and** `180` RPM / API key | `RATE_LIMIT_SUBMIT_IP_RPM`, `RATE_LIMIT_SUBMIT_KEY_RPM` |
| Authenticated routes (Bearer) | `600` RPM / **user id** | `RATE_LIMIT_AUTH_USER_RPM` — dashboard users not capped like anonymous |

**CORS:** Allowed origins come from `ALLOWED_ORIGINS` (comma-separated). Browser requests from another origin must list that origin here.

---

## Public (no Bearer token)

### `GET /system/bootstrap-status`

Returns whether initial setup is still required.

**Response:** `200`

```json
{ "setup_required": true }
```

### `POST /system/setup`

One-time initialization. Fails with `409` if already initialized.

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `s3_endpoint` | string | yes |
| `s3_access_key` | string | yes |
| `s3_secret_key` | string | yes |
| `s3_bucket` | string | yes |
| `telegram_bot_token` | string | yes |
| `telegram_chat_id` | string | yes |
| `admin_email` | string (email) | yes |
| `admin_password` | string (min 8 chars) | yes |

**Response:** `201` `{ "status": "setup complete" }`

### `GET /system/health`

Liveness/deps check.

**Response:** `200` `{ "status": "ok", "db": "up", "s3": "up"|"not_configured" }`  
Or `503` if DB or (when configured) S3 check fails.

### `POST /auth/login`

**Body:** `{ "email": "...", "password": "..." }`

**Response:** `200`

```json
{ "access_token": "...", "refresh_token": "...", "api_key": "..." }
```

`api_key` is the account’s **primary** form ingest key (embed on websites). One key per user; data is isolated by user in the shared PostgreSQL database.

### `POST /auth/refresh`

**Body:** `{ "refresh_token": "..." }`

**Response:** `200` `{ "access_token": "...", "refresh_token": "...", "api_key": "..." }`

### `POST /auth/logout`

Stateless logout (always `200`): `{ "status": "logged out" }`

### `POST /submit/{project_key}`

Public form endpoint. **`project_key` in the URL must exactly equal the `x-api-key` header.**

- **Recommended:** use the logged-in account’s **`api_key`** (from login / `GET /auth/me`). Submissions are stored in that user’s **default inbox** project (created at setup). Other accounts cannot read them.
- **Legacy:** a **project** `public_api_key` still works; submissions attach to that project only.

**Headers:**

- `Content-Type: application/json`
- `x-api-key: <same as project_key in path>`

**Body (either shape):**

Recommended:

```json
{
  "data": { "field1": "value" },
  "files": []
}
```

Alternative: a flat JSON object (stored as submission `data`):

```json
{ "name": "...", "email": "..." }
```

**Response:** `201` — created `Submission`:

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "data": {},
  "files": [],
  "created_at": "RFC3339"
}
```

**Errors:** `401` invalid key, `429` project cap (5000 submissions), `400` bad JSON.

---

## Authenticated (`Authorization: Bearer <access_token>`)

Requires completed setup (`SetupGuard`). Without setup, secured routes return `503` `{ "error": "system setup required" }`.

### `GET /auth/me`

**Response:** `200` `{ "email": "...", "api_key": "..." }`

### `GET /projects`

**Response:** `200` `{ "projects": [ Project, ... ] }`

`Project`: `id`, `user_id`, `name`, `public_api_key`, `created_at`

### `POST /projects`

**Body:** `{ "name": "Project name" }`

**Response:** `201` — full `Project` object (includes new `public_api_key`).

### `PATCH /projects/{id}`

**Body (optional fields):**

- `name` — rename
- `regenerate_key` — if `true`, issues a new **project** `public_api_key` (only affects clients still using that legacy project key, not the account `api_key`)

**Response:** `200` `{ "status": "updated" }`

### `GET /projects/{id}/submissions`

**Query:** `limit` (default 50, max 500), `offset` (default 0)

**Response:** `200`

```json
{
  "submissions": [ Submission, ... ],
  "limit": 50,
  "offset": 0
}
```

### `DELETE /projects/{id}/submissions/bulk`

**Body:** `{ "submission_ids": ["uuid", "..."] }`

**Response:** `200` `{ "deleted": <number> }`

### `POST /uploads/presign`

Requires valid S3-compatible storage in system config.

**Body:**

| Field | Type |
|-------|------|
| `project_id` | string (UUID) |
| `filename` | string |
| `content_type` | string (must be in server allowlist) |
| `size` | int64 bytes (≤ `UPLOAD_MAX_SIZE_BYTES`) |

**Response:** `200`

```json
{
  "upload_url": "https://...",
  "object_key": "projectId/date/uuid.ext",
  "expires_at": "RFC3339"
}
```

**Errors:** `400` file too large / MIME not allowed, `404` project not found / not owned.

### `GET /projects/{id}/export`

**Query:** `format` — `xlsx` (default) or `pdf`

**Response:** File download (`Content-Disposition: attachment`).

### `GET /system/update-status`

**Response:** `200`

```json
{
  "update_available": false,
  "latest_version": "",
  "current_version": "0.1.0"
}
```

### `POST /system/update-trigger`

Only if `ALLOW_UPDATE_TRIGGER=true`. **Response:** `202` `{ "status": "update started" }` or `409` if disabled.

### `PUT /system/config`

Update S3 and Telegram settings (not admin password).

**Body:** `s3_endpoint`, `s3_access_key`, `s3_secret_key`, `s3_bucket`, `telegram_bot_token`, `telegram_chat_id`

**Response:** `200` `{ "status": "updated" }`
