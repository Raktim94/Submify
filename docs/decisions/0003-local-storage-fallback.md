# 0003: Local disk is the automatic upload fallback when no S3 is configured — not a separate opt-in mode

Date: 2026-08-19

## Context

Discovery (`docs/roadmap/01-DISCOVERY.md`) found that file uploads were
**hard-mandatory on S3-compatible credentials** — `POST /uploads/presign`
returned `400` with no way to upload anything if a project (and its
account-level fallback) had no S3 endpoint/bucket/keys configured. That
directly contradicts the master plan's requirement (brief §17) that local
storage work out of the box for simple self-hosted deployments.

The existing upload model is presigned-PUT: the API never sees the file
bytes for S3 — it hands the browser a signed URL and the browser PUTs
straight to the bucket. Local disk has no equivalent of "a signed URL
pointing at a bucket" to hand out, since there's no third-party service to
delegate to — the upload has to go *through* the API itself.

## Decision

`POST /uploads/presign` now falls back to local disk automatically,
whenever S3 resolves to unconfigured (same precedence as before: project
creds, then account creds) — there is no separate "storage mode" setting to
turn on; it's just what happens when S3 isn't set up. This means local
storage is the zero-config default, and S3 remains an opt-in upgrade path,
exactly matching the direction implied by brief §17 ("local storage for
simple deployments, S3-compatible for scale").

To make an upload-through-the-API model work with the same "handed a URL,
just PUT to it" client contract as S3:

- A one-time, short-lived `UploadToken` (in-memory, matching this
  codebase's existing in-process rate-limiter pattern rather than adding
  Redis for one feature — see brief §79, don't overengineer) is minted at
  presign time, encoding the server-chosen object key and the byte-size cap
  the client committed to. `PUT /api/v1/uploads/local/:token` consumes it
  exactly once.
- Downloads are served at `GET /api/v1/uploads/local/*key`, **public, by
  design** — this mirrors the *existing, unchanged* assumption already
  baked into the S3 path: the current codebase has the *client* (the
  customer's own website) construct the final `files[].url` itself after a
  successful presigned PUT, with the server never validating that the URL
  in a submission's `files` field actually corresponds to something
  uploaded through `/uploads/presign`. That only works today if the
  customer's S3 bucket is public-read (a common self-hosted MinIO/R2
  pattern) or if the customer's own frontend adds its own access control.
  Local storage inherits exactly that same trust model rather than
  inventing a stricter one just for itself, which would make local storage
  behave inconsistently with S3 for no real security gain: an
  unauthenticated GET to an unguessable key is not meaningfully weaker than
  an unauthenticated GET to a public S3 object, and object keys already
  contain a UUID component.

## Consequences

- **True private-storage-with-signed-download-URLs (brief §18) is not
  implemented for either backend** — this ADR explicitly declines to bolt
  a stricter model onto local storage alone while leaving S3 as-is, but
  that means §18 is still open work for both backends. Flag it in the
  Phase 9 security audit rather than assuming it's covered.
- The API server now must have a writable, persistent volume
  (`docker-compose.yml`'s `./data/uploads:/data/uploads`, `LOCAL_STORAGE_DIR`
  env var, default `/data/uploads`) — losing that volume loses locally
  stored files, the same way losing `./data/postgres` loses the database.
  This needs to be part of the eventual backup story (brief §22: "uploaded
  files if configured").
- `UploadToken`s are in-memory: they don't survive an API restart, and
  won't be shared across replicas if this is ever run with more than one
  API instance. A client whose presign→PUT window spans a restart just
  gets a 404 and re-requests a presign — the same practical failure mode
  as an S3 presigned URL expiring, so this doesn't need special handling
  now, but note it if horizontal scaling is ever pursued (Discovery already
  flagged the existing rate limiter has this same limitation).
- `storage.LocalBackend.resolvePath` rejects any object key that would
  resolve outside `RootDir` as defense in depth, even though every caller
  today only ever passes server-generated keys (`storage.ProjectKey`) —
  don't remove that check on the assumption client input can't reach it;
  a future change could add a code path that does.
