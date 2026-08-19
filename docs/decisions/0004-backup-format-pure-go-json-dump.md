# 0004: Backups are a pure-Go JSON table dump, not a shelled-out `pg_dump`

Date: 2026-08-19

## Context

Brief §19-27 wants local + S3 backup/restore. The obvious first instinct for
a Postgres-backed app is to shell out to `pg_dump`/`pg_restore` (or `psql`).
That was rejected for three concrete reasons specific to this codebase:

1. `apps/api`'s Dockerfile builds a minimal production image (this repo's
   own convention, see `CLAUDE.md`/`docs/deployment.md`) that does not
   bundle Postgres client tools today. Shelling out would mean adding
   `postgresql-client` (or matching-version `pg_dump`) to the runtime
   image just for this feature, and keeping its major version aligned with
   whatever Postgres version the `db` service in `docker-compose.yml` is
   pinned to (`postgres:16-alpine`) — a real, ongoing maintenance surface
   pg_dump/pg_restore are notoriously strict about version matching for
   custom-format dumps.
2. This codebase has zero ORM and zero existing subprocess-execution code
   anywhere (`internal/db/store.go` is 100% `database/sql` + raw SQL) —
   shelling out would be a new pattern (subprocess management, stdout/
   stderr piping, exit-code handling, credential-passing via env or a
   temp `.pgpass`) introduced for exactly one feature, which cuts against
   brief §79 ("don't overengineer... unnecessary dependencies").
3. A hand-picked table allowlist (see below) is *more* correct here than a
   full `pg_dump`, because two existing tables — `schema_migrations` and
   `refresh_sessions` — must NOT be restored verbatim (see Decision).
   `pg_dump` backs up everything by default; getting the exclusions right
   would mean maintaining `--exclude-table` flags in lockstep with the
   allowlist anyway, so the allowlist has to exist either way — at which
   point a native per-table dump is the simpler mechanism, not the more
   complex one.

## Decision

Backups are a `.zip` archive (Go's `archive/zip`, stdlib, no new
dependency) containing:

- `manifest.json` — `{product, backupVersion, applicationVersion,
  createdAt}`, per brief §24.
- `data/<table>.jsonl` — one file per backed-up table, one JSON object per
  line, produced by `SELECT row_to_json(t) FROM <table> t ORDER BY id`.
  Backed-up tables: `organizations`, `users`, `organization_members`,
  `projects`, `submissions`, `system_configs`. **Deliberately excluded**:
  `schema_migrations` (the *restored-into* instance's migrations already
  ran at boot, before restore is ever reachable — overwriting this table
  with the backup's old migration history would desync it from the
  schema that's actually live) and `refresh_sessions` (JWT refresh tokens
  are meaningless outside the `JWT_SECRET` they were signed under; users
  simply log in again post-restore, which is normal and expected).
- `uploads/<object key>` — a copy of every file under `LOCAL_STORAGE_DIR`,
  only present if local storage has files (S3-stored files are **not**
  copied into the backup archive — they already live durably in the
  external bucket; re-copying them would bloat every backup with data
  that isn't actually at risk of being lost with this instance).
- `checksums.json` — SHA-256 of every other entry in the archive, checked
  before any restore write happens (brief §25).

Restore (`POST /system/restore`) uses
`INSERT INTO <table> SELECT * FROM json_populate_record(NULL::<table>, $1::json)`
per row — Postgres's own JSON-to-row coercion, which correctly round-trips
JSONB columns (`submissions.data`, `projects.allowed_origins`, …) and
`TIMESTAMPTZ` columns without any per-column Go mapping code to keep in
sync as the schema grows.

This slice's restore is scoped to **fresh installs only** — gated on
`HasAnyUser() == false`, the same invariant `/auth/register` already
enforces, and reachable without authentication for the same reason
`/auth/register` is (there's no admin account to authenticate as yet).
Restoring *over* an active installation (brief §27: safety backup first,
explicit confirmation, transactional) is real, harder, and explicitly
**not** built in this slice — see `docs/roadmap/00-MASTER-PLAN.md`.

## Consequences

- **Every new table added in later phases (calendar, bookings, webhooks,
  API keys, audit logs, …) must be added to the `backupTables` allowlist
  deliberately** (`apps/api/internal/db/backup.go`) — it will silently be
  excluded from backups otherwise. This is the correct default (a
  brand-new, half-built table shouldn't automatically become part of the
  disaster-recovery contract), but it means backup coverage needs an
  explicit checklist item whenever a phase adds persistent state, not an
  assumption that "it's in Postgres so it's backed up."
- `json_populate_record` requires the restoring database's live schema to
  structurally match what the JSON keys expect closely enough to coerce —
  it is **not** a strict backupVersion-to-backupVersion contract like a
  full `pg_dump` would be. `manifest.json`'s `backupVersion` field exists
  so a future schema-incompatible change can refuse to restore an
  old-format backup outright rather than silently produce partial/wrong
  data — that version-gate check must be added the day the row shape of
  any backed-up table changes in a way that breaks old backups (e.g. a
  new `NOT NULL` column with no default), not deferred indefinitely.
- Because restore is fresh-install-only in this slice, it does not need
  to handle ID collisions, partial-failure rollback of an active
  instance, or a pre-restore safety backup — all genuinely simpler than
  the eventual restore-over-existing-install feature. Don't mistake this
  slice's simplicity for that harder feature being done.
