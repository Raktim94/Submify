# 0009: S3 backup destination, restore-over-an-active-install, and self-update

Date: 2026-08-20

## Context

[0004](0004-backup-format-pure-go-json-dump.md) shipped local backup/restore
but explicitly deferred three things: an S3 backup destination, restoring
*over* an already-active installation (only fresh-install restore existed),
and any self-update mechanism (`internal/update.Checker` was fully written
but wired to nothing). The user asked for all three, plus an actual
one-click "update now" — not just "here's a newer version, go update it
yourself" — and explicitly accepted, when asked, that a real self-update
means giving the update mechanism Docker-socket-level control over the
host.

## Decision 1: S3 backup destination reuses `system_configs`, not `users.s3_*`

`system_configs` already has `S3Endpoint`/`S3AccessKey`/`S3SecretKey`/
`S3Bucket` columns (plus `UpdateAvail`/`LatestVersion`) sitting unread by
any handler — confirmed via grep that `GetSystemConfig`/
`UpdateSystemConfig`/`CreateInitialSystemConfig` had zero callers, and that
`/auth/register` (the real bootstrap path) never inserts a `system_configs`
row at all (only the legacy, dead `CreateInitialSystemConfig` did). Reusing
`users.s3_*` (the per-account presigned-upload storage backend) instead
would conflate "where a project's form-upload files live" with "where
instance backups go" — an operator could set one without intending the
other. `system_configs` is already the right shape (single-row,
instance-wide) and needed no new migration — just two new store methods,
`SetBackupS3Config`/`SetUpdateCheckResult`, both `INSERT ... ON CONFLICT
(id) DO UPDATE` upserts (not bare `UPDATE`s) because that row may not exist
yet on a real instance.

## Decision 2: restore-over-an-active-install truncates before inserting

The existing `RestoreTableJSONL` (0004) only `INSERT`s — correct for
fresh-install restore, where every table is empty. Restoring over an
already-active install means every table already holds rows with the same
primary keys, so a plain insert fails on row 1 with a duplicate-key error —
confirmed by hitting exactly that with a real Postgres container before
this was caught. `applyRestoreArchive` now issues one `TRUNCATE TABLE
<tables present in this archive> CASCADE` inside the same transaction
before restoring rows, for **any** restore, not just the active-install
path (a no-op on an empty fresh install, so 0004's existing behavior is
unaffected). `CASCADE` is safe here because every foreign key in this
schema is `ON DELETE CASCADE`, and the one FK from a table *outside* the
backup allowlist — `refresh_sessions -> users` — is exactly the table
whose rows a destructive restore *should* invalidate (users simply log in
again, same reasoning 0004 already applied to why `refresh_sessions` isn't
itself backed up).

Restoring over an active install (`POST /system/restore/active` for a
local upload, `POST /system/backup/s3/restore` for an S3 restore point) is
**admin-only** (unlike the unauthenticated fresh-install-only
`POST /system/restore`, which has no admin account to authenticate as
yet), gated behind a request field that must exactly equal the string
`"RESTORE"` (mirrors the frontend's existing `ConfirmDialog` typed-match
pattern), and always takes an automatic pre-restore safety backup — written
to local disk (`SAFETY_BACKUP_DIR`, deliberately never S3, so it doesn't
depend on S3 being reachable at exactly the moment a restore is being
attempted) — immediately before the destructive write. This was verified
end-to-end against a real Postgres container: populate real data, restore
a different backup over it, confirm the automatic safety backup is itself
restorable (not just written) by restoring it back over the now-different
state and getting the original data back.

## Decision 3: self-update spawns a separate one-shot helper container

A naive self-update handler running `git pull && docker compose up --build
-d` from inside the `api` container cannot work: `docker compose up`
stops the old `api` container before starting the new one, and the process
issuing that compose command lives inside the very container being
stopped — it dies mid-sequence, leaving the stack half-updated. This is
the same self-referential-kill problem every container self-updater has to
solve; Watchtower and Portainer both solve it the same way, which
`POST /system/update/apply` now does too: instead of running the update
itself, it uses its own mounted `docker.sock` to launch a **separate,
ephemeral** container (`docker run --rm -d -v docker.sock -v <repo>:<repo>
docker:cli sh -c "git pull --ff-only && docker compose up --build -d"`).
That helper container is not one of the services being recreated, so it
survives the `api` container's teardown and finishes the sequence. The
`api` image already bundled the `docker` CLI + compose plugin (an earlier,
anticipatory comment in the Dockerfile called this out before this feature
existed) — this decision just adds the socket mount and the endpoint that
uses it.

**Consequence, accepted explicitly by the user when asked**: mounting
`docker.sock` into the `api` container gives it host-root-equivalent
control regardless of the container's own UID. Keeping a separate
unprivileged `submify` user inside the container (as the Dockerfile did
before this feature) provided no real additional isolation once that mount
exists, so the Dockerfile now runs the container as root — documented
inline at the `USER` line's former location, not silently dropped.
`GET /system/update/check` (uses `internal/update.Checker` against
`SUBMIFY_UPDATE_REPO`, a real GitHub repo with real tags) and
`POST /system/update/apply` are both admin-only, same as every other
`/system/*` write in this file.

## What was NOT verified here

The actual "does the container really come back up after killing itself"
behavior cannot be verified from this sandboxed dev environment — there is
no second real Docker host to observe a restart onto, and this
environment's own `docker.sock` doesn't exercise that the same way a real
deployment's would. What *was* verified: the archive/checksum/truncate/
restore mechanics end-to-end against a real Postgres container; the S3
backup/list/restore-from-S3 path end-to-end against a real MinIO
container; the update-check path against the real `Raktim94/Submify`
GitHub repo (correctly found tag `v0.1.0`); that `docker compose config`
accepts the new `docker-compose.yml` mounts without error. The update-apply
container-spawn command itself was reviewed but not executed against a
real Docker host in this session — confirm it on a real deployment before
relying on it, same caveat this ADR is recording so a future session
doesn't assume otherwise.

## Consequences

- Any future table added to `backupTables` automatically gets correct
  truncate-before-restore semantics for free — no separate allowlist to
  maintain for Decision 2.
- `SAFETY_BACKUP_DIR` accumulates a file on every restore attempt,
  including ones that ultimately fail validation (the safety backup is
  taken before the archive is even opened) — there is no automatic
  pruning yet. An operator relying on this feature heavily should
  periodically clear old files there; a retention policy is a reasonable
  future addition, not built in this slice.
- The self-update endpoint depends on `SUBMIFY_REPO_DIR` pointing at a real
  git working tree with a configured remote the container can reach
  (`git pull --ff-only` fails loudly, not silently, if that assumption
  doesn't hold — no fallback behavior was added for that case).
