# Submify

Self-hosted, API-first form-submission + file-upload backend
(submify.nodedr.com). Currently mid-way through a large platform-upgrade
program — **read `docs/roadmap/00-MASTER-PLAN.md` first**, every time,
before making changes here. It's the single source of truth for scope,
phase status, and the Definition-of-Done checklist; don't re-derive plan
context from chat history. `docs/roadmap/01-DISCOVERY.md` has the
ground-truth architecture audit. `docs/decisions/` has ADR-lite records for
non-obvious calls (same convention as `nodedr-ecommerce-template`'s
`docs/decisions/` — see its `README.md` for the format).

## Stack

- `apps/api` — Go 1.26, Gin, raw SQL via `database/sql` + `pgx/v5` (no
  ORM), AWS SDK v2 (S3-compatible presigned uploads), `golang-jwt/jwt/v5`,
  argon2id password hashing.
- `apps/web` — Next.js 16.3 App Router, React 19.2, TS 5.9, Tailwind 3.4,
  Zod. No component library yet (a few hand-rolled `components/ui/*`
  primitives) — not shadcn. Run `npx shadcn@latest mcp init --client
  claude` here before relying on shadcn MCP tools (per this machine's
  global convention — it's per-project, not global).
- Postgres 16, migrations at `apps/api/internal/db/migrations/*.sql`
  (embedded via `//go:embed`, auto-run on every API boot, tracked in
  `schema_migrations`). **The root `migrations/0001_init.sql` and
  `apps/api/migrations/0001_init.sql` are stale duplicates, never read at
  runtime** — never edit them; add new migrations only under
  `apps/api/internal/db/migrations/`.

## Go toolchain on this machine

No system Go was installed as of 2026-08-19 — it's now at `~/.local/go`
(go1.26.6), added to `PATH` via `~/.bashrc`. If a fresh shell doesn't have
`go` on `PATH`, source `~/.bashrc` or prefix commands with
`export PATH="$PATH:$HOME/.local/go/bin"`.

## Verifying backend changes for real

Docker is available on this machine. Before considering any migration or
Go change "done," verify it against a real Postgres, not just `go build`:

```bash
docker run -d --name submify-migration-test -e POSTGRES_USER=submify \
  -e POSTGRES_PASSWORD=testpass123 -e POSTGRES_DB=submify -p 15432:5432 \
  postgres:16-alpine
# wait for pg_isready, then:
cd apps/api && DATABASE_URL="postgres://submify:testpass123@127.0.0.1:15432/submify?sslmode=disable" \
  PORT=18080 JWT_SECRET="test-secret-at-least-32-characters-long-ok" \
  timeout 8 go run ./cmd/server
# inspect with: docker exec submify-migration-test psql -U submify -d submify -c "..."
# then: docker rm -f submify-migration-test
```

For migrations that touch existing data (like `0009_organizations.sql`),
test **both** paths: a fresh install (zero pre-existing rows) and a
simulated upgrade (seed realistic pre-existing rows on the migrations
*before* the new one, then let the new one run) — a migration that only
works on an empty DB isn't actually verified for real installs.

## Current architecture state (see `docs/roadmap/01-DISCOVERY.md` for full detail)

- **Single-tenant per instance today, migrating toward real multi-tenancy.**
  `organizations`/`organization_members` tables now exist
  (migration 0009, ADR
  [0001](docs/decisions/0001-workspaces-layer-approach.md)) and every
  `projects` row has a backfilled `organization_id` — but **no handler or
  store code enforces it yet**. Don't assume tenant isolation works just
  because the column exists.
- Auth is JWT + argon2id, authorization is a single `is_admin` boolean —
  no granular roles yet (owner/admin/manager/member/viewer is the target,
  per the master plan).
- File uploads require S3-compatible credentials — **no local-disk storage
  backend exists yet**, which the master plan's Phase 3 needs to fix.
- Telegram is the only notification channel; no generic webhooks, no CRM
  integration, no calendar/booking of any kind exist yet — all greenfield.
- Test coverage is minimal (2 unit tests, JWT + password hashing only).

## Secrets policy

Same as the rest of NodeDR's projects: never commit real credentials, only
`.env.example` placeholders. `config.Validate()` already refuses to boot in
`GIN_MODE=release` with a weak/short `JWT_SECRET` — don't weaken that check.

## Commits

Never add `Co-Authored-By: Claude` — commit on the user's name only.
