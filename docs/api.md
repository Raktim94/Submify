# Submify v1 API Contract

**Base path:** `/api/v1` (except the public submit endpoint, which is `/api/submit`)
**Full URL example:** `https://your-host:2512/api/v1` (behind Nginx in Docker)

All JSON bodies use `Content-Type: application/json` unless noted. Error responses are `{ "error": "..." }`.

**One account per instance:** Submify is single-tenant. `POST /auth/register` only succeeds while no account exists yet (`GET /system/bootstrap-status` returns `"setup_required": true`). Once the first account is created, registration closes — `POST /auth/register` returns `403` and you sign in at `/auth/login` from then on.

**Rate limiting** (all return `429` with a JSON `error` string):

| Scope | Default (env) | Notes |
|-------|----------------|-------|
| `GET /system/bootstrap-status`, `GET /system/health` | *unlimited* | Monitoring / first-load friendly |
| `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/system/setup` | `25` RPM / IP (`RATE_LIMIT_SENSITIVE_PUBLIC_RPM`) | Slows brute force |
| `POST /api/submit` | `90` RPM / IP **and** `180` RPM / API key (`RATE_LIMIT_SUBMIT_IP_RPM`, `RATE_LIMIT_SUBMIT_KEY_RPM`) | |
| Authenticated routes (Bearer) | `600` RPM / **user id** (`RATE_LIMIT_AUTH_USER_RPM`) | Dashboard users not capped like anonymous |

**CORS:** Allowed origins come from `ALLOWED_ORIGINS` (comma-separated). Browser requests from another origin must list that origin here. Per-project `allowed_origins` further restrict which origins may call `/api/submit` with that project's key.

---

## Public (no Bearer token)

### `GET /system/bootstrap-status`

**Response:** `200` `{ "setup_required": true | false }`

### `POST /auth/register`

Creates the **one and only** account for this instance. Fails with `403` once an account already exists.

**Body:**

| Field | Type | Required |
|-------|------|----------|
| `full_name` | string | yes |
| `phone` | string | yes |
| `email` | string (email) | yes |
| `password` | string (min 8 chars) | yes |

**Response:** `201`

```json
{ "access_token": "...", "refresh_token": "...", "api_key": "...", "email": "...", "full_name": "...", "phone": "..." }
```

**Errors:** `409` email already registered, `403` registration closed (an account already exists).

### `POST /system/setup`

Retired. Always returns `410` pointing to `POST /auth/register`.

### `GET /system/health`

Liveness/deps check.

**Response:** `200` `{ "status": "ok", "db": "up" }` — or `503` `{ "status": "degraded", "db": "down" }` if the DB ping fails.

### `POST /auth/login`

**Body:** `{ "email": "...", "password": "..." }`

**Response:** `200`

```json
{ "access_token": "...", "refresh_token": "...", "api_key": "...", "full_name": "...", "phone": "..." }
```

`api_key` is the account's **primary** form ingest key (embed on websites).

**Errors:** `401` invalid credentials.

### `POST /auth/refresh`

**Body:** `{ "refresh_token": "..." }` (or send the refresh token via `x-refresh-token` header / `__Host-submify_rt` cookie — the body is optional if one of those is present)

**Response:** `200` `{ "access_token": "...", "refresh_token": "...", "api_key": "...", "full_name": "...", "phone": "..." }`

**Errors:** `400` missing refresh token, `401` invalid/expired/revoked refresh token.

### `POST /auth/logout`

Stateless logout (always `200`): `{ "status": "logged out" }`. Revokes the refresh session if a valid refresh token is supplied.

### `POST /api/submit`

Public form endpoint — **not** under `/api/v1`.

**Headers:**

- `Content-Type: application/json`
- `x-api-key: <project public key>` — required. Either the account's primary `api_key` (submissions land in the **default** project) or a specific project's `public_api_key` (submissions land in that project).
- `x-signature` (optional) — HMAC-SHA256 of the raw body, hex-encoded, signed with the project's secret key. Send this only from a server you trust; never embed the secret key in browser code. A valid signature also bypasses the `allowed_origins` check.

**Body (either shape):**

Recommended:

```json
{ "data": { "field1": "value" }, "files": [] }
```

Alternative: a flat JSON object is stored directly as `data`:

```json
{ "name": "...", "email": "..." }
```

**Response:** `201` — created submission:

```json
{ "id": "uuid", "project_id": "uuid", "data": {}, "files": [], "created_at": "RFC3339" }
```

**Errors:** `401` missing/invalid/unknown `x-api-key` or bad `x-signature`, `403` origin not allowed for this project, `400` empty body or bad JSON, `413` payload exceeds `SUBMIT_MAX_BODY_BYTES`, `429` project at the 5,000-submission cap.

---

## Authenticated (`Authorization: Bearer <access_token>`, or session cookies)

Requires a completed setup. Without any account, these routes return `503` `{ "error": "no accounts yet; register first" }`.

### `GET /auth/me`

**Response:** `200`

```json
{
  "email": "...", "api_key": "...", "full_name": "...", "phone": "...",
  "telegram_chat_id": "...", "s3_endpoint": "...", "s3_bucket": "...",
  "telegram_configured": true, "s3_configured": false
}
```

### `GET /dashboard/summary`

**Response:** `200` `{ "latest_submission": { "at": "RFC3339", "project_id": "uuid", "project_name": "..." } | null }`

### `GET /projects`

**Response:** `200` `{ "projects": [ Project, ... ] }`

`Project`: `id`, `user_id`, `name`, `is_default`, `api_key`, `api_secret`, `allowed_origins`, `telegram_chat_id`, `telegram_configured`, `s3_endpoint`, `s3_bucket`, `s3_configured`, `created_at`

### `POST /projects`

**Body:** `{ "name": "Project name" }`

**Response:** `201` — full `Project` object (includes new key pair).

### `PATCH /projects/{id}`

**Body (all fields optional — only send what you want to change):**

| Field | Effect |
|-------|--------|
| `name` | rename |
| `regenerate_key` | `true` issues a new public/secret key pair; old keys stop working immediately |
| `allowed_origins` | replace the array of allowed browser origins for `/api/submit` (empty array = no restriction) |
| `telegram_bot_token`, `telegram_chat_id` | set per-project Telegram notification target |
| `s3_endpoint`, `s3_access_key`, `s3_secret_key`, `s3_bucket` | set per-project storage credentials (takes priority over account-level settings) |

**Response:** `200` `{ "status": "updated", "project": Project }`

### `DELETE /projects/{id}`

Deletes a project and **all of its submissions**. Irreversible. The account's **default** project cannot be deleted (`400`).

**Response:** `200` `{ "status": "deleted" }`

### `GET /projects/{id}/submissions`

**Query:** `limit` (default 50, max 500), `offset` (default 0)

**Response:** `200` `{ "submissions": [ Submission, ... ], "limit": 50, "offset": 0 }`

### `DELETE /projects/{id}/submissions/bulk`

**Body:** `{ "submission_ids": ["uuid", "..."] }`

**Response:** `200` `{ "deleted": <number> }`

### `POST /uploads/presign`

Requires S3-compatible storage configured (project-level, falling back to account-level).

**Body:**

| Field | Type |
|-------|------|
| `project_id` | string (UUID) |
| `filename` | string |
| `content_type` | string (must be in `ALLOWED_MIME_TYPES`) |
| `size` | int64 bytes (≤ `UPLOAD_MAX_SIZE_BYTES`) |

**Response:** `200` `{ "upload_url": "https://...", "object_key": "...", "expires_at": "RFC3339" }`

**Errors:** `400` file too large / MIME not allowed / storage not configured, `404` project not found.

### `GET /projects/{id}/export`

**Query:** `format` — `xlsx` (default) or `pdf`

**Response:** file download (`Content-Disposition: attachment`), capped at the first 5,000 submissions.

### `PUT /users/me/integrations`

Update account-level integrations (legacy fallback used when a project has no S3/Telegram settings of its own).

**Body (partial):** `telegram_bot_token`, `telegram_chat_id`, `s3_endpoint`, `s3_access_key`, `s3_secret_key`, `s3_bucket`

**Response:** `200` `{ "status": "updated" }`

### `PUT /users/me/password`

**Body:** `{ "current_password": "...", "new_password": "..." }` (min 8 chars)

**Response:** `200` `{ "status": "password updated" }`

**Errors:** `401` current password incorrect.

### `POST /users/me/api-key/rotate`

Rotates the account's primary `api_key`. Old key stops working immediately.

**Response:** `200` `{ "status": "rotated", "api_key": "..." }`

### `POST /users/me/projects/rotate-keys`

Rotates the public/secret key pair for **every** project owned by the account.

**Response:** `200` `{ "status": "rotated", "projects_rotated": <number> }`
