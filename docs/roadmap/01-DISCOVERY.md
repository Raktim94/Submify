# Phase 1 Discovery — ground truth as of 2026-08-19

Read this before writing any code for the platform-upgrade program (see
`00-MASTER-PLAN.md`). Everything below was verified by reading the actual
repos, not assumed. Baseline confirmed green the same day: `go build ./...`
and `go test ./...` both pass in `apps/api` (2 existing tests: JWT roundtrip,
argon2 password roundtrip).

## Submify (`~/Submify`, `Raktim94/Submify`)

**Stack**: `apps/api` — Go 1.26, Gin, raw SQL via `database/sql` + `pgx/v5`
(no ORM), AWS SDK v2 for S3, `golang-jwt/jwt/v5`, argon2id (`golang.org/x/
crypto/argon2`), excelize + gofpdf for export. `apps/web` — Next.js 16.3
App Router, React 19.2, TS 5.9, Tailwind 3.4, Zod. No component library
beyond a few hand-rolled `components/ui/*` primitives — **not shadcn yet**,
despite this machine's global shadcn MCP convention; needs `npx shadcn@latest
mcp init --client claude` run inside `apps/web` before using it here.

**⚠️ Migration gotcha**: real, auto-running migrations live at
`apps/api/internal/db/migrations/*.sql` (0001–0008), embedded via
`//go:embed` and run on every API boot, tracked in `schema_migrations`. The
root-level `migrations/0001_init.sql` and `apps/api/migrations/0001_init.sql`
are **stale duplicates that are never read at runtime** — schema predates
several ALTERs. Any new migration goes in `apps/api/internal/db/migrations/`
only. The two stale files should be deleted or clearly marked dead in a
follow-up cleanup commit (not done yet — flagging so nobody edits them
thinking they matter).

**Auth**: JWT access/refresh (HS256, `JWT_SECRET`), refresh sessions tracked
server-side with rotation/revocation (migration 0006). argon2id password
hashing. Authorization is a single boolean `is_admin` on `users` — **no
granular roles/permissions**. A separate project-scoped "portal" JWT exists
for client-facing submission viewing, gated by a per-project password or the
owning account's session.

**Multi-tenancy: none.** Single-tenant per instance by design —
`POST /auth/register` only succeeds while zero accounts exist; the admin can
add more non-admin accounts after that, but there's no `organizations`/
`workspaces` table. Isolation today is just `user_id → projects →
submissions` FKs in one shared DB. **This is the single biggest structural
gap relative to the target** — see ADR
[0001](../decisions/0001-workspaces-layer-approach.md) for how it's being
resolved.

**Forms/submissions**: no field-type system — a "form" *is* a `projects` row
(`api_key`, `api_secret`, `allowed_origins`, `telegram_*`, `s3_*`,
`portal_*`); the public endpoint accepts arbitrary JSON stored as
`submissions.data JSONB`. `POST /api/submit` (unversioned, deliberately):
body-size cap, `x-api-key` required, optional HMAC `x-signature`, optional
origin allowlist, hard cap of 5000 submissions/project (no rotation), IP +
key rate limiting via an in-memory token bucket (not spam/CAPTCHA
protection — pure throughput limiting).

**File uploads**: presigned-PUT only, S3-compatible creds **mandatory**
(works with MinIO/R2/Wasabi/AWS via path-style addressing) — **no local-disk
storage option exists at all**, and presign fails with 400 if no S3 creds
are configured anywhere. Object key is server-generated
(`projectID/date/uuid.ext`), so no path-traversal risk, but also **no
server-side MIME/content sniffing** — only the client-declared
`content_type` is checked against an allowlist before issuing the presigned
URL; the server never sees the bytes.

**Notifications**: Telegram is the only channel, implemented and working
(3-retry fire-and-forget). No generic webhooks, no email, no CRM
integration of any kind exist yet.

**API**: `/api/v1/...` versioned (except `/api/submit`). External auth is a
flat, unscoped `pk_live_*` / HMAC secret pair — no scopes, no expiry, no
per-key audit trail, only bulk key rotation. Rate limiting is in-process
(won't survive restarts or scale horizontally — fine for now, flag for
later if multi-instance HA becomes a goal).

**Docker/deploy**: 5-service compose (db/api/web/nginx/optional
cloudflared), `install.sh` one-command installer, real health checks. **No
CasaOS manifest yet** — unlike nodedr-pos/OrderRestro, this hasn't been
packaged for CasaOS/ZimaOS (see `reference_casaos_zimaos_app_packaging.md`
in memory for the proven pattern to reuse).

**Tests**: 2 unit tests total (JWT, password hashing). No handler/
integration/e2e/frontend tests, no CI-run suite found. Test infrastructure
is essentially greenfield for this program.

**Docs**: `README.md`, `docs/api.md`, `docs/deployment.md` are accurate and
current — extend, don't rewrite from scratch. `SECURITY.md` is an **unfilled
GitHub template placeholder** (fake version table) — needs writing from
scratch. `THIRD_PARTY.md` is a 4-line stub, not a real inventory.

**Secrets hygiene**: clean — no live credentials found in tracked files;
compose's inline example secrets are clearly fallback defaults, and
`config.Validate()` refuses to boot in `GIN_MODE=release` with a weak
`JWT_SECRET`. Doc gap: several real env vars (`CORS_*`, `UPLOAD_*`,
`RATE_LIMIT_*`, `AUTH_COOKIE_*`, etc.) exist in `config.go` but aren't
listed in root `.env.example` — fix during the docs phase.

## Zulivio (`~/zulivio`, `Raktim94/zulivio`)

**Stack**: `apps/backend` — NestJS + Prisma/Postgres, already multi-tenant
via `Organization`.

**Contacts/leads**: no `Contact` model — `Lead` is the only prospect entity
(`prisma/schema.prisma:396-424`): `fullName`, `email?`, `phone?`, `company?`,
`source?` (free-text, usable as-is for tagging Submify-origin leads),
`status` enum, `ownerId?`/`createdById` (Employee), converts to
`Opportunity` via a dedicated transactional endpoint. **No unique
constraint on email/phone** and **no dedupe logic on create** — CSV import
already re-creates duplicates today on re-import, so dedupe needs to be
designed from scratch for the Submify integration too, not just wired up.

**External API surface**: everything sits behind `AuthGuard` — **no
unauthenticated/public inbound endpoint exists for external systems**.
`POST /api/v1/leads` is auth-gated and employee-attributed.

**Auth for machine callers**: an `ApiKey` model exists but it's a
**personal access token tied 1:1 to an Employee** (built for the MCP
server), not an org-level service credential — every downstream permission
check runs as that employee. **A cross-product integration needs a new
credential type**: org-scoped, not tied to a human, independently
revocable, ideally scope-limited to "create leads."

**No event/queue/webhook infrastructure at all** — no BullMQ or equivalent,
no outbound webhook sender, everything is synchronous request/response. The
one existing external integration (Google Sheets import/export) is
pull/push on explicit user action, not event-driven, but its per-org
`GoogleSheetsConfig` enable/disable pattern is a reasonable precedent to
copy for making the Submify integration optional per-org.

**MCP server** (`apps/backend/src/mcp/`, `POST /api/v1/mcp`): AI-assistant-
facing (Claude/ChatGPT acting *as* a logged-in employee), same personal
`ApiKey` bearer auth, in-memory per-employee rate limiting. Confirms the
"bearer-token-in, resolves-to-actor" auth style as existing precedent, but
not directly reusable for a headless, non-employee-originated event like
`form.submitted`.

**Gaps for safe inbound lead-creation from Submify**: no service/org-level
API key model; no idempotency-key handling anywhere (a retried webhook
delivery would create a duplicate lead); no dedupe-by-email/phone; no
event/webhook receiver infrastructure; the existing rate limiter is
in-memory/single-instance only (inadequate for a production webhook
receiver, per a code comment in `common/rate-limiter.ts:9-11`); no
feature-flag/soft-dependency pattern yet, though `GoogleSheetsConfig`'s
per-org config-row pattern is a good template for one.

## Immediate implications for the plan

1. Phase 2's first real deliverable is the Organizations/Workspaces layer
   in Submify — almost everything else (calendar, scoped API keys, audit
   logs, CRM integration) needs `organization_id` to hang off. See ADR 0001.
2. Zulivio's side of the integration needs a new `IntegrationKey`/service-
   account model + an idempotency-key table + a lead-dedupe strategy before
   any inbound webhook receiver can be built safely — this is real,
   unstarted work on the Zulivio side, not just "call an existing endpoint."
3. Storage abstraction must add a **local-disk backend** — today S3-
   compatible credentials are hard-mandatory for any upload to work at all,
   which contradicts the brief's "local storage for simple self-hosted
   deployments" requirement (§17).
4. Delete-or-mark-dead the two stale `migrations/0001_init.sql` files early,
   before anyone (human or agent) edits them thinking they're live.
5. Existing R2 credentials already saved on this machine
   (`~/.config/cloudflare/r2-credentials.env`, see reference memory
   `reference_cloudflare_r2_credentials.md`) are a candidate for testing the
   S3 storage/backup adapters end-to-end — but that memory flags the token
   as over-scoped and due for rotation once a project claims it; rotate
   before using it for Submify's automated backup testing, don't reuse the
   over-scoped token as-is.
