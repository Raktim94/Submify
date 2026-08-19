# 0006: Zulivio integration pushes leads via Zulivio's existing personal API key — no new Zulivio-side infrastructure

Date: 2026-08-19

## Context

The master plan's original Phase 6 scope (§28-36 of the brief) called for a
full bidirectional event-driven integration: an event bus on Submify's
side, and on Zulivio's side a new org-scoped service-account credential
type, an idempotency-key table, and dedupe-by-email/phone logic — all
flagged as real, unstarted work in `01-DISCOVERY.md`.

The user explicitly redirected this (2026-08-19): don't build the full
integration project yet; instead find a simpler way to get Submify
submissions into Zulivio as leads, using an API key, without requiring
changes on both sides. Discovery already established that Zulivio has a
working, authenticated `POST /api/v1/leads` endpoint and a personal
`ApiKey` model (bearer token → resolves to acting as the owning employee)
that's already fully built and in production use by Zulivio's own MCP
server — nothing new needs to exist on the Zulivio side for a project
owner to generate a key and hand it to Submify.

## Decision

Submify gets a per-project (not per-organization) "Zulivio" integration
setting — `zulivio_enabled`, `zulivio_api_url`, `zulivio_api_key` — 
matching the existing per-project pattern for Telegram and S3 rather than
inventing a new settings shape. On every successful `POST /api/submit`,
if the project has this configured, Submify makes an async, best-effort
`POST {zulivio_api_url}/api/v1/leads` call with `Authorization: Bearer
{zulivio_api_key}` (`internal/zulivio/zulivio.go`, structurally identical
to the existing `internal/telegram` package: 3 retries, fire-and-forget,
logged failures don't affect the submission response).

**Field mapping is a best-effort heuristic, not a configurable mapping
UI** — this is the deliberate simplification the user asked for. Submify's
submission `data` is arbitrary client-supplied JSON with no fixed schema
(see Discovery), so there's no reliable per-field mapping to configure
against. Instead, common key name variants are matched case-insensitively:
`name`/`full_name`/`fullname` → `fullName` (required by Zulivio; if none
match, the submission is skipped with a logged reason rather than sending
a request that would fail `CreateLeadDto`'s validation), `email` → `email`,
`phone`/`phone_number`/`mobile` → `phone`, `company`/`organization` →
`company`. Everything else in the submission is serialized into `notes` so
no data is silently dropped even when it doesn't map to a known field.
`source` is set to `"Submify: <project name>"` and `autoAssign: true` is
always sent, so pushed leads immediately enter Zulivio's existing
assignment-rule pipeline instead of sitting unowned.

## Consequences

- **No Zulivio-side code changes were made or are required** — this
  integration works entirely by Submify calling an endpoint and auth
  mechanism Zulivio already ships. A customer connects the two products
  themselves by generating a personal API key in Zulivio (Settings → API
  Keys, per the MCP server's existing UI) and pasting it into Submify's
  project settings — no coordinated deploy needed on either side.
- **This inherits Zulivio's existing gaps, unfixed**: no dedupe-by-email/
  phone (re-submitting the same form twice creates two leads — a
  pre-existing Zulivio limitation per Discovery, not something this
  integration works around), and the personal-API-key model means the
  pushed leads are attributed to whichever employee generated the key,
  not to "Submify" as a system actor. Acceptable for the scope the user
  asked for; revisit if Zulivio ever gets a proper service-account
  credential type.
- **No idempotency handling** — a retried request (from the 3-attempt
  retry logic, or a future replay) can create a duplicate lead. Given
  fire-and-forget async delivery with no delivery-record/dead-letter
  tracking, an operator has no visibility into a submission that
  ultimately failed all 3 attempts other than the server log line — this
  is real information Submify's UI does not currently surface anywhere
  (no "Zulivio delivery status" column on submissions). Flagging as a
  known, accepted gap for this simplified version, not a silent omission.
- The API key is stored in plaintext in the `projects` table, same as
  this project's existing S3 secret key and Telegram bot token — no new
  secrets-handling precedent set or needed here.
