# Submify → Production-Grade Platform: Master Plan

Status: **Phases 1–2 done. Phase 3 (local storage) and Phase 4 (backup/restore core) landed. Phase 5 (Calendar & Booking) functionally complete including UI. Phase 6 partially landed (simplified Zulivio integration, email notifications). Phase 7 (UX) started (app shell). Phases 8–13 not started.** (This line was stale for several sessions — corrected 2026-08-20; the per-phase checklists above and the Session Log below are the actual source of truth, this line is just a summary pointer.)
Owner: Raktim | Driver: Claude Code
Source brief: full 93-section master engineering prompt, given 2026-08-19.
This file is the single source of truth for the program — read this instead
of re-deriving scope from scratch in a new session. Update the **Session
Log** at the bottom every time work is picked up or paused.

Companion docs: `docs/decisions/` (ADR-lite, non-obvious calls only),
`docs/roadmap/01-DISCOVERY.md` (ground-truth audit, filled after Phase 1),
`ARCHITECTURE.md`, `SECURITY_AUDIT.md`, `BACKUP_AND_RESTORE.md`,
`INTEGRATIONS.md`, `CHANGELOG.md` (created as their phases complete — do not
pre-create empty stubs; a missing file means "not reached yet", which is
itself signal).

---

## 0. What this program is

Evolve **Submify** (self-hosted, API-first form + file-upload backend,
submify.nodedr.com) into a production-grade platform that also does calendar
booking/scheduling (Calendly-class), while integrating optionally and
bidirectionally with **Zulivio** (NodeDR's workforce CRM, zulivio.nodedr.com).
Both products must remain fully independent — neither requires the other to
run.

Additional explicit requirements from the user (2026-08-19, second message):
real product screenshots (Playwright) for every doc/user-manual, not
fabricated ones; Google Stitch (or equivalent) for marketing-site visuals/
AI-generated imagery where genuinely useful; the marketing site must be
well-structured and SEO-optimized; Submify should be MCP-enabled (expose an
MCP server, consistent with the pattern already used on other NodeDR
products like Zulivio); everything properly documented, including a full
user manual with screenshots; marketing site + GitHub repo both updated at
the end, not left stale.

**Known blocker, flag don't fake**: Google Stitch MCP tools are currently
broken (schema bug on `$defs/ScreenInstance`) and the stored API key needs
rotation — see local reference memory `reference_google_stitch_mcp.md`.
Don't claim Stitch-generated assets exist until this is actually fixed and
verified; fall back to the existing `frontend-design`/`premium-ui-workflow`
skills + real screenshots for marketing visuals if Stitch stays broken.

## 1. Guiding principles (condensed from brief §92, keep re-reading these)

- Self-hosted first, API-first, secure by default, modular (forms/calendar/
  storage/CRM/notifications talk through clean interfaces, not hard imports).
- No unnecessary lock-in — export/backup/restore/migrate must always work.
- Easy before powerful — progressive disclosure, not 100 fields on one screen.
- No fake implementation, ever: no dead buttons, no mocked "done" features,
  no TODO placeholders shipped as done. If something is blocked on a
  credential/infra we don't have, implement everything reachable and
  document precisely what's missing (see Stitch note above for the live
  example of this rule in effect).
- Don't overengineer — no microservices/brokers/framework churn without a
  concrete justification tied to this repo's actual scale.
- Make architectural decisions autonomously using the existing codebase as
  the constraint; only stop and ask when a decision genuinely needs business
  info or a credential we don't have.

## 2. Phases

Each phase's checklist items are pulled from the numbered brief sections
(noted in parens) so the original reasoning is one lookup away if needed.
Check items off as they're **actually verified working**, not merely coded.

### Phase 1 — Discovery (§1–2) ✅ done 2026-08-19
- [x] Full audit of Submify: stack, auth, schema/multi-tenancy, forms,
      uploads, notifications/webhooks, API, Docker, tests, docs, env vars,
      secrets hygiene → `docs/roadmap/01-DISCOVERY.md`
- [x] Full audit of Zulivio's integration surface: contact/lead schema,
      existing external API surface, auth for machine callers, existing
      outbound integration patterns, dedupe logic, MCP server purpose →
      same discovery doc
- [x] Internal implementation plan derived from *actual* findings — this
      master plan revised accordingly (see below, and per-item notes)
- [x] Go toolchain installed locally (`~/.local/go`, go1.26.6 — none was
      present on this machine before; needed to verify any backend change
      actually builds/tests rather than shipping unverified Go code)

### Phase 2 — Architecture (§3, 46, 87) — in progress
- [x] Foundational decision made + **verified against a real Postgres**:
      organizations/workspaces layer. See
      `docs/decisions/0001-workspaces-layer-approach.md` for the reasoning
      and `apps/api/internal/db/migrations/0009_organizations.sql` for the
      migration. Verified two ways against a throwaway `postgres:16-alpine`
      container: (1) fresh install, zero users → migration is a clean
      no-op, `organization_id NOT NULL` holds trivially; (2) simulated
      real upgrade — seeded a pre-existing admin + teammate user and a
      project on migrations 0001–0008 only, then applied 0009 → produced
      exactly one `organizations` row, admin correctly promoted to
      `owner`, teammate correctly mapped to `member`, and the existing
      project's `organization_id` correctly backfilled. `go build`,
      `go vet`, and `go test ./...` all green afterward (still just the 2
      original tests — no application code touches the new tables yet).
- [x] **Tenant-isolation enforcement landed** (2026-08-19, ADR
      [0002](../decisions/0002-organization-scoped-default-project.md) +
      migration `0010_organization_scoped_projects.sql`): every
      project-scoping store method and handler now authorizes by
      `organization_id`, not `user_id`. Verified against a real running
      server (not just unit tests) end to end: register → org+owner+
      default-project created → create a second project → admin invites a
      teammate with an explicit role (`POST /users`, new `role` field) →
      teammate logs in and correctly sees **both** shared projects →
      `GET /users` shows both members with roles → deleting the org owner
      is correctly refused (`ErrCannotDeleteOwner`, tested by temporarily
      granting a second admin to confirm the check fires, not just the
      self-delete guard) → deleting a non-owner member succeeds → a real
      public form submission via the project's `x-api-key` flows through
      to `GET /dashboard/summary`. `docs/api.md` updated to match
      (`GET/POST /users`, `DELETE /users/{id}` were previously undocumented
      — now written up; `GET /auth/me` documents the new
      `organization_id`/`organization_role` fields). `go build`/`vet`/
      `test ./...` green throughout.
- [ ] **Known, deliberate limitation carried forward**: `AdminGuard` (who
      may call `/users*`) still checks the instance-wide `is_admin` boolean,
      not organization role — noted in code comments and `docs/api.md`.
      Replacing it with real role-based checks (so e.g. a `manager` could
      have a defined permission set distinct from `admin`) is follow-up
      work, not done in this slice.
- [ ] **Also not yet done**: true cross-*organization* isolation is
      untestable via the live API today, because registration stays closed
      after the first account ever exists — only one organization can ever
      come to exist per instance right now (see `docs/api.md`'s
      "Organization & members" section). §41's cross-tenant-access testing
      needs either a multi-org-per-instance registration path or an
      admin-provisioned "create a second organization" flow before it can
      be exercised for real — flagging so nobody claims §41 is verified
      based on this slice alone. What *is* verified: members within one
      organization correctly share access, and a member cannot be
      confused for having access outside their own organization's rows
      (every query now has an explicit `organization_id` predicate).
- [ ] Remaining module boundaries still to design: Calendar, Booking,
      Storage abstraction, Webhooks, Integrations, CRM, Backup, Restore,
      Audit Logs, scoped API Keys, System Settings, Monitoring
- [ ] `ARCHITECTURE.md` — not started; write once enough of Phase 2/3 has
      landed to diagram real flows instead of speculative ones

### Phase 3 — Core infrastructure (§17–18, 37–40)
- [ ] Housekeeping first: delete or clearly mark dead the two stale
      duplicate migration files (`migrations/0001_init.sql` at repo root
      and `apps/api/migrations/0001_init.sql`) — confirmed by Discovery to
      never be read at runtime; only `apps/api/internal/db/migrations/`
      is live. Leaving them risks a future edit landing in the dead copy.
- [x] **Local storage fallback landed** (2026-08-19, ADR
      [0003](../decisions/0003-local-storage-fallback.md)): `POST
      /uploads/presign` now falls back to local disk automatically when no
      S3 credentials are configured (project or account level) — no
      separate storage-mode setting, it just works either way. New
      `internal/storage/local.go` (LocalBackend, path-traversal-safe
      `resolvePath`, temp-file-then-rename writes) + `upload_tokens.go`
      (in-memory one-time upload tokens, mirroring the existing rate
      limiter's in-process pattern rather than adding Redis). New routes
      `PUT/GET /api/v1/uploads/local/...`. `docker-compose.yml` gained a
      persistent `./data/uploads` volume + `LOCAL_STORAGE_DIR`. Verified
      live end to end: presign with zero S3 config → correctly returns a
      local upload URL → PUT real bytes → GET them back byte-for-byte →
      token is single-use (second PUT attempt correctly 404s) → an
      undersized cap correctly rejects an oversized PUT with no partial
      file left on disk → both a raw `..` path-traversal attempt and a
      percent-encoded one are blocked before reaching application code
      (router-level path cleaning), with the handler's own
      `resolvePath`/`strings.Contains("..")` checks as defense-in-depth
      behind that. `docs/api.md` updated with the new response shape and
      the two new endpoints.
- [ ] S3 backend itself (existing presign flow) still untested against a
      real S3-compatible endpoint in this program — only the pre-existing
      unit-level code was inspected, not exercised. Candidate target:
      existing Cloudflare R2 credentials already on this machine (see
      reference memory `reference_cloudflare_r2_credentials.md`) — rotate
      the token first, it's flagged over-scoped; don't reuse as-is.
- [ ] File upload security hardening still open: extension validation
      beyond MIME allowlist, and — as ADR 0003 states plainly — **neither
      backend has actual private-storage-with-signed-download-URLs yet**
      (§18); both currently rely on "the URL is unguessable" as the access
      control, which is what the pre-existing S3 code already assumed and
      this slice deliberately did not silently upgrade only for local
      storage. Revisit in the Phase 9 security audit.
- [ ] Versioned API (`/api/v1/...`), API keys with scopes/expiry/revocation/
      last-used, rate limiting, structured errors, pagination

### Phase 4 — Backup & Restore (§19–27)
- [x] **Manual local backup (create + download) landed** (2026-08-19, ADR
      [0004](../decisions/0004-backup-format-pure-go-json-dump.md)):
      `POST /system/backup` (admin-only) streams a `.zip` — manifest,
      one JSON-lines file per backed-up table (`organizations`, `users`,
      `organization_members`, `projects`, `submissions`, `system_configs`),
      a copy of local-storage uploads, and a SHA-256 checksum per entry.
- [x] **Fresh-install restore landed**: `POST /system/restore`
      (unauthenticated, self-guards on `HasAnyUser()==false`, same
      invariant `/auth/register` already enforces) validates the manifest
      + every checksum before writing anything, then restores all tables
      transactionally via `json_populate_record`, then best-effort
      restores local files.
- [x] **Verified with a real end-to-end round trip**, not just unit
      tests: populated a live instance (owner, 2nd project, an invited
      `viewer` teammate, a real form submission, a locally-stored
      uploaded file) → created a backup → restored it onto a *completely
      separate*, freshly-provisioned Postgres+instance → confirmed: login
      with the original password works, both projects are listed, both
      members and their exact roles (`owner`/`viewer`) are intact, the
      submission's JSONB data round-tripped correctly, and the uploaded
      file's bytes matched the original **exactly** (`diff` clean).
      Safety checks also verified live: restoring onto an
      already-populated instance is correctly refused (`403`); a
      corrupted zip is rejected by Go's own zip CRC before reaching app
      code; a *validly-zipped but tampered* entry (content changed,
      zip's own CRC recomputed correctly) is caught by the SHA-256
      checksum layer specifically — confirming that layer isn't dead
      code shadowed by the zip format's own integrity check. Confirmed
      zero partial writes after both rejected-restore attempts.
- [x] **S3 backup destination + restore-over-an-active-install + real
      self-update landed** (2026-08-20, ADR
      [0009](../decisions/0009-s3-backup-and-self-update.md)): `PUT/GET/
      POST /system/backup/s3*` (config, upload, list-with-`?latest=1`,
      restore-from-S3) and `POST /system/restore/active` (local upload
      over an already-active install) — both restore paths admin-only,
      gated behind a required `"confirm": "RESTORE"` field, and always
      take an automatic pre-restore safety backup to local disk first.
      `GET /system/update/check` + `POST /system/update/apply` wire up
      the previously-dead `internal/update.Checker` to a real one-shot-
      helper-container self-update (can't run `docker compose up` on its
      own service from inside itself — see ADR for why — so it spawns a
      separate ephemeral container via its own mounted `docker.sock`).
      New Settings UI: "Backup & restore" and "Updates" cards, admin-
      gated, `lib/backup.ts`. A real bug was caught and fixed during
      verification: the existing `RestoreTableJSONL` only ever `INSERT`s,
      which is fine for fresh-install restore (empty tables) but fails
      immediately with duplicate-key errors once restoring over an
      already-active install with existing rows — fixed by `TRUNCATE`ing
      each affected table inside the restore transaction first (a no-op
      on the fresh-install path, so 0004's existing behavior is
      unaffected).
      **Verified live**: full round trip against a real Postgres
      container (register → create data → download backup → restore-
      over-active-install via a real browser file upload in Playwright →
      confirm data matches, confirm the *automatic safety backup itself*
      is restorable — not just written); S3 backup/list/restore-from-S3
      against a real MinIO container, exercised both via `curl` and live
      through the browser UI; corrupted-zip and tampered-checksum
      archives both correctly rejected with `400` before any write;
      typed-confirmation dialogs confirmed to gate the Restore/Update
      buttons in the actual browser (disabled until the exact phrase is
      typed). **Not verified** (documented plainly in the ADR rather than
      assumed): the actual "container restarts itself after update-apply"
      behavior — this sandboxed dev environment has no second real Docker
      host to observe that on; confirm on a real deployment before
      relying on it.
- [ ] **Still not done**: automatic scheduled backups (daily/weekly/
      monthly + retention policy — today is still "create one now" on
      demand, s3 or local, not a scheduler); backup encryption (§26 —
      not evaluated yet either way, still open); pruning old files in
      `SAFETY_BACKUP_DIR` (every restore attempt adds one, including
      failed/rejected ones, with no automatic cleanup yet).

### Phase 5 — Calendar & Booking (§6–15) — functionally complete end-to-end 2026-08-19
(remaining gaps: team scheduling, external calendar sync, custom booking
questions, non-Telegram reminder channels — all explicitly scoped out below,
not silently missing)
- [x] Event types (duration, location, buffers, min notice, max advance,
      slot interval) — API + storage done. **Not done**: custom
      per-booking questions (§7's "custom questions, required fields")
      and confirmation-message customization — schema/API don't have
      these fields yet, only the scheduling mechanics.
- [x] **Public booking pages — landed and visually verified**: `/calendar`
      (authenticated dashboard — create event types via a weekly-hours
      form, copy booking links, view/cancel upcoming bookings) and the
      public flow at `/book/[eventTypeId]` (Event → Date → Time → Details
      → Confirmation) plus `/book/manage/[token]` for reschedule/cancel.
      Verified live in a real browser: created an event type through the
      UI, booked a real slot on the public page, reschedule/cancel both
      exercised including the destructive-action confirm dialog. Found
      and fixed one real bug this way (a raw `<button>` inheriting the
      site's global purple button-reset, making its text invisible — not
      catchable by `tsc`/`next build`, only by actually looking at it).
- [x] **Availability engine — done and rigorously tested**: weekly
      recurring rules + date overrides (full-day block or custom hours)
      + buffers + min/max notice + slot intervals, UTC storage with DST
      verified by dedicated automated tests (not spot checks — see
      `internal/availability/availability_test.go`, 7 tests including
      two that assert exact UTC instants across real 2026 DST
      transitions). Double-booking conflict detection is a DB-level
      `EXCLUDE` constraint (ADR 0005) — live-verified against exact and
      buffer-overlapping double-book attempts, both correctly rejected.
- [ ] Team scheduling (single/multi host, round-robin, pooled availability)
      — not started; today an event type has exactly one host.
- [x] Secure reschedule/cancel via signed links — `manage_token` is a
      24-byte random token (`bkg_...`), never a sequential/guessable ID.
      Live-verified: view/reschedule/cancel all work via the token, and
      cancelling twice fails cleanly instead of erroring or double-firing.
- [x] **Telegram booking reminders landed**: create/reschedule/cancel all
      fire a best-effort Telegram notification to the event type's host
      (`notifyHostOfBooking` in `internal/httpapi/calendar.go`), reusing
      the existing `internal/telegram` package — verified live (fake bot
      token correctly produced a real Telegram API 404, proving the
      request actually fires with the right shape, not just that the
      function was called). **Not done**: email/webhook/SMS/WhatsApp/Slack/
      Teams reminder channels, and no per-event-type notification
      preferences yet (always fires if the host has Telegram configured).
- [x] **Calendar UI landed** (2026-08-20): real month/week/day grid views
      at `/calendar` (`components/calendar/month-view.tsx`,
      `time-grid-view.tsx` — one shared hourly-grid implementation behind
      both Week and Day, parameterized by how many day columns render),
      a mini-calendar date picker, click-to-create/edit via
      `event-dialog.tsx`, current-time indicator, all-day row. Built with
      `date-fns` + `lucide-react` + `framer-motion` (none existed in this
      app before — added this session) instead of shadcn, since this
      project's hand-rolled `components/ui/*` primitives (not shadcn — see
      `CLAUDE.md`) were the actual existing pattern to extend. Original
      visual identity (indigo/violet/slate, matching the existing brand),
      not a lookalike clone, per the brief's §6 instruction. **Also
      landed alongside it, not originally scoped as part of this line**:
      a new personal-events/reminders feature (§ below) so the grid shows
      the user's own agenda, not just bookings — see the new checklist
      item under this phase. Drag-to-reschedule (mentioned in this line's
      original text) explicitly **not built** — scoped out as real added
      complexity or a follow-up increment, documented plainly rather than
      silently dropped.
- [x] **Personal calendar events/reminders landed** (2026-08-20, ADR
      [0008](../decisions/0008-personal-calendar-events.md)) — new
      `personal_events` table (migration `0014`), org+user-scoped so one
      user never sees another's items even in the same org (live-verified:
      a second user in the same org correctly got `[]`/404 on another
      user's items via `GET`/`PATCH`/`DELETE`). Reminders fire a real
      Telegram notification at `remind_at` via a new background job
      (`StartBackgroundJobs` was previously an empty stub — this is the
      first real background job in the codebase, a 60s `time.Ticker`, not
      a queue/cron dependency) — live-verified: a fake bot token produced
      a real Telegram API 401, confirming the request genuinely fires, and
      `reminder_sent_at` correctly prevented a re-send on the next tick.
      Full backup/restore round trip re-verified with a pending
      (not-yet-fired) reminder included — survived correctly. New
      `docs/api.md` section, `GET/POST /calendar/items`,
      `PATCH/DELETE /calendar/items/{id}`.
- [x] **App shell replaced with a real application layout** (2026-08-20,
      user-reported: the authenticated app "looks like a website" because
      every page hand-duplicated the marketing site's `components/nav.tsx`
      pill-nav with zero shared layout). New `app/(app)/` route group +
      `components/app-shell/*` (persistent sidebar with icons, topbar,
      mobile slide-over drawer via `framer-motion`) wraps
      dashboard/calendar/projects/submissions/settings/export; marketing
      pages keep their own nav, untouched. New global "+ Create" quick-
      access menu (topbar, reachable from every authenticated page) plus a
      quick-actions row on the Dashboard. This is a meaningful slice of
      Phase 7's "unified design system" item below, done early because it
      was directly requested — Phase 7's remaining scope (Settings
      reorganization, full onboarding/empty/error states, a11y pass) is
      still open.
      **Two real bugs found and fixed only by actually looking at the
      running app** (not catchable by `tsc`/`next build`/lint — same
      lesson already logged once in this file for the booking pages):
      (1) an infinite refetch loop on `/calendar` — `date` was recomputed
      as a fresh `Date` object every render, breaking the
      `useMemo`/`useCallback` dependency chain, hammering the API into 429s;
      fixed by memoizing on the raw string search-param. (2) every raw
      `<button>`'s *inactive* state (tabs, calendar day numbers, mini-
      calendar days, dropdown items, chevrons) rendered solid brand-purple
      instead of its intended color, because `globals.css`'s unscoped
      `button { bg-brand-500 }` reset wins whenever a branch doesn't set
      its own explicit background — every new raw button now sets one
      unconditionally. A third bug (Day view's date range starting from
      "right now" instead of local midnight when no `date` URL param was
      present, silently hiding same-day items earlier than the current
      time) was also found via live Playwright testing and fixed.
- [ ] External calendar provider *architecture* (Google/Outlook/ICS) — only
      implement what's completable with credentials we actually have;
      otherwise ship the adapter framework + config UI/docs and say so
- [x] **`.ics` generation landed**: `GET /public/bookings/{token}/ics`
      (`internal/httpapi/ics.go`, dependency-free RFC 5545 single-VEVENT
      writer), linked from both the booking confirmation screen and the
      manage page as "Add to calendar." Downloaded and manually verified
      the generated file's structure live (correct UTC `DTSTART`/`DTEND`,
      escaped `DESCRIPTION`, `STATUS`).

### Phase 6 — Integrations (§16, 28–36)
- [ ] Forms↔Calendar integration via internal events, not hard imports
- [x] **Zulivio integration — landed as a deliberately simplified version**
      (user redirect, 2026-08-19; see ADR
      [0006](../decisions/0006-zulivio-integration-via-existing-api-key.md)
      for the full reasoning): per-project push of new submissions into
      Zulivio's *existing* `POST /api/v1/leads` via its *existing*
      personal API-key auth — **zero Zulivio-side code changes**. New
      `internal/zulivio` package (best-effort field-mapping + async push
      with retries, same shape as `internal/telegram`), `PATCH /projects/
      {id}` gains `zulivio_enabled`/`zulivio_api_url`/`zulivio_api_key`,
      and a Projects-page settings panel to configure it.
      **Verified with a real cross-product test** — not mocked: generated
      an actual Zulivio personal API key via its live API, configured it
      on a real Submify project, submitted a real form, and confirmed the
      lead appeared in Zulivio's own `/api/v1/leads` list with correct
      field mapping, the right `source` tag, unmapped fields preserved in
      `notes`, and — proving `autoAssign` actually worked — a real owner
      already assigned by Zulivio's own assignment-rule engine.
      **Explicitly not built** (the full original Phase 6 scope, still
      open if ever needed): an event bus, a configurable field-mapping
      UI, dedupe-by-email/phone (inherits Zulivio's existing lack of
      this), delivery-status visibility in Submify's UI, and a
      Zulivio-side service-account credential type (still just personal
      keys, attributed to whichever employee generated one).
- [ ] Generic CRM integration path (REST/webhook/API keys) so customers
      aren't locked into Zulivio specifically
- [ ] Telegram notifications (bot token + chat ID, Test Notification, safe
      storage — never re-displayed after save, never logged) — **note**:
      Telegram itself already existed pre-session for form submissions
      and was extended to bookings this session; this line tracks the
      brief's specific "Test Notification" UI affordance, which doesn't
      exist yet.
- [ ] Webhook system: signing secret, delivery records, retries w/
      exponential backoff, timeout, manual retry, SSRF prevention

### Phase 7 — UX (§49–54, plus 2026-08-19 additions)
- [ ] Settings reorganized into the documented sections (General, Org,
      Users & Permissions, Forms, Storage, Calendar, Notifications,
      Integrations, CRM, API, Webhooks, Backup & Restore, Security, System)
- [ ] Unified design system (spacing/type/buttons/forms/cards/dialogs/
      alerts/tables/dropdowns/badges/nav/icons/skeletons/loading) — run
      through `frontend-design` + `web-design-guidelines` skills, not ad hoc
- [ ] Onboarding flow, empty states, error states (no "Something went
      wrong", no stack traces to the user)
- [ ] Real product screenshots (Playwright, ~375/768/1440px) captured for
      every major screen — feeds both the user manual and marketing site;
      AI-generated imagery (Stitch or fallback) reserved for marketing
      hero/decorative assets only, never presented as product UI
- [ ] Accessibility pass (`accesslint` skill) + responsive check at all
      three breakpoints

### Phase 8 — Deployment (§56–59)
- [ ] Production Docker hardening (non-root, multi-stage, healthchecks,
      graceful shutdown, env validation)
- [ ] CasaOS packaging — reuse the pattern already proven for nodedr-pos
      (PR #996) and OrderRestro (PR #1001); see local reference memory
      `reference_casaos_zimaos_app_packaging.md`
- [ ] First-run setup flow (admin/org/storage/optional restore)
- [ ] Upgrade path + rollback guidance for existing installs — never
      destroy data on upgrade

### Phase 9 — Security (§39–45, 62)
- [ ] Full OWASP-Top-10-class review: authN/authZ, IDOR, CSRF, XSS, SQLi,
      SSRF, insecure uploads, mass assignment, race conditions, open
      redirects, rate limiting, session fixation, token/secret leakage,
      insecure headers, dependency vulns, webhook spoofing, backup/S3
      exposure, tenant isolation, insecure CORS
- [ ] Security headers configured for the actual architecture (CSP, HSTS,
      X-Content-Type-Options, Referrer-Policy, Permissions-Policy, framing)
- [ ] Audit log for security-sensitive admin actions
- [ ] `SECURITY_AUDIT.md` produced with real severities, fixes applied, and
      remaining risks stated plainly — never marked fixed without
      verification

### Phase 10 — Testing (§60–62)
- [ ] Unit + integration + E2E coverage of the 8 acceptance flows in §61
      (account→form→submission; upload→storage→retrieval; booking create→
      dashboard; reschedule; Telegram; Zulivio CRM sync; local backup/
      restore; S3 backup/restore) plus the security-specific tests in §62

### Phase 11 — Documentation (§63–66, plus 2026-08-19 additions)
- [ ] README rewritten to match actual shipped functionality (see §64 list)
- [ ] Full doc set per §65 (Introduction → Upgrading, 33 pages) — only the
      ones that map to real features; no fictional-feature docs
- [ ] `docs/api.md` brought current + OpenAPI spec if the stack supports it
- [ ] **User manual**: long-form, screenshot-heavy, explains how every
      feature actually works end to end (not just a reference) — this is
      an explicit deliverable, not folded into the README
- [ ] `ARCHITECTURE.md`, `BACKUP_AND_RESTORE.md`, `INTEGRATIONS.md` finished

### Phase 12 — Websites (§67–71, plus 2026-08-19 additions)
- [ ] submify.nodedr.com rewritten to describe only shipped, verified
      capabilities — defensible claims only (§68), real screenshots, full
      technical SEO pass (metadata, sitemap, structured data, keywords —
      see the `seo` skill), MCP-server availability mentioned if shipped
- [ ] nodedr.com/software listing updated for Submify (and for Zulivio if
      its capabilities materially changed for the integration)

### Phase 13 — Release (§69–70, 90–91)
- [ ] Changelog (Added/Changed/Fixed/Security/Deprecated/Removed)
- [ ] GitHub repo updated: README, docs, examples, no committed secrets,
      meaningful version bump
- [ ] `RELEASE_REPORT.md` — completed features, architecture decisions,
      migrations, security summary, test results, deployment validation,
      backup test results, calendar test results, integration test
      results, docs updated, sites updated, remaining external
      requirements, known issues (never hidden)

## 3. Master Definition-of-Done checklist (brief §91, flattened)

Copied verbatim as the acceptance bar — do not consider the program done
until every applicable line is genuinely true and verified, or explicitly
and honestly logged under "remaining external requirements" with a real
blocker (missing credential/infra), not convenience:

- [ ] Existing Submify functionality still works
- [ ] Form submissions, file uploads, local storage, S3 storage work
- [ ] Local backup + download + restore work; S3 backup + restore work;
      fresh-install restore works; backup validation works
- [ ] Calendar event types, availability, timezone conversion, booking,
      conflict detection, reschedule, cancellation, calendar dashboard work
- [ ] Telegram integration, webhook system, CRM integration architecture,
      Zulivio integration (where enabled) work
- [ ] Submify works without Zulivio; Zulivio works without Submify
- [ ] API + API permissions + authentication + tenant isolation work
- [ ] Docker works; CasaOS installation works; migrations work
- [ ] Automated tests pass; E2E tests pass
- [ ] Security audit completed; critical vulns resolved; high-risk vulns
      resolved unless explicitly documented with a genuine blocker
- [ ] README, wiki/docs, API docs, backup docs, integration docs updated
- [ ] Marketing website updated; GitHub repo updated; NodeDR software
      portfolio updated; changelog/release notes completed

## 4. Session Log

Append one entry per work session — a few lines, not a full report (the
detail lives in the actual docs/commits). This is what a future session
should read first.

- **2026-08-19**: Program kicked off. Cloned `Submify` and
  `nodedr-ecommerce-template` locally. Set up this master plan +
  `docs/decisions/` ADR-lite convention. Ran Phase 1 Discovery audits
  (Submify stack/architecture; Zulivio integration surface) → written up
  in `docs/roadmap/01-DISCOVERY.md`. Installed a local Go toolchain
  (none existed on this machine) so backend changes can actually be
  built/tested, not just written. Made and shipped the first real Phase 2
  decision: organizations/workspaces schema (ADR 0001,
  `0009_organizations.sql`), verified against a real throwaway Postgres
  container on both a fresh-install path and a simulated real-data
  upgrade path (admin/teammate/project seeded on old schema, then
  migrated) — backfill produced the correct owner/member roles and
  project linkage both times. `go build`/`go vet`/`go test ./...` green
  throughout. **Not yet done**: no handler/store code enforces
  `organization_id` yet — that's next. Nothing else in Phase 2+ (roles,
  calendar, storage abstraction, backup/restore, webhooks, CRM/Zulivio
  integration, security audit, docs, marketing site, etc.) has been
  started. This is genuinely a multi-week+ program; expect this log to
  grow one real, verified slice at a time across many sessions.

- **2026-08-19 (continued)**: Landed tenant-isolation enforcement, the
  follow-up flagged above. New `internal/db/organizations.go` (role
  constants, membership/role queries, `DeleteUserInOrganization` with an
  owner-cannot-be-removed guard). Rewrote `RegisterUser`/
  `CreateUserByAdmin` so registration creates an organization+owner and
  invites join the *same* org instead of getting isolated private
  projects (ADR 0002, migration 0010 — also fixed the `is_default`
  uniqueness constraint to be per-organization instead of per-user, since
  multiple pre-existing per-user defaults could now collide). Every
  project-scoping store method and handler switched from `user_id` to
  `organization_id`; `AuthGuard` now resolves the caller's organization
  once per request. Verified live end-to-end against a real running
  server, not just unit tests — see the Phase 2 checklist above for the
  exact scenario (register, invite a teammate with a role, teammate sees
  shared projects, owner-deletion correctly refused, real form submission
  flows through). `docs/api.md` updated. Honest gaps carried forward:
  `AdminGuard` is still `is_admin`-boolean-based, not role-based, and true
  cross-*organization* isolation (§41) can't be exercised yet since only
  one organization can ever exist per instance until the registration-gate
  is redesigned — flagging so nobody claims §41 is fully verified from
  this slice alone. Next up: storage abstraction (local + S3, §17 —
  currently S3-only) or the calendar/booking module (§6-15, entirely
  greenfield) — whichever is tackled next, keep verifying against a real
  Postgres + live server, not just `go build`.

- **2026-08-19 (continued further)**: Closed the local-storage gap flagged
  in Discovery (ADR 0003) — uploads no longer hard-require S3. New
  `internal/storage/local.go` + `upload_tokens.go`, new
  `PUT/GET /api/v1/uploads/local/...` routes, `docker-compose.yml` volume.
  Verified live: presign-without-S3 → local fallback → real PUT/GET
  round-trip → single-use token enforcement → oversized-upload rejection
  → both raw and percent-encoded path-traversal attempts blocked.
  `docs/api.md` updated. `go build`/`vet`/`test ./...` green. Still open:
  the S3 backend itself hasn't been exercised against a real bucket in
  this program (only read, not tested); neither backend has true
  signed-download-URL privacy yet (§18, explicitly deferred, not
  forgotten). Next candidates: exercise S3 against real R2 (after
  rotating the flagged-over-scoped token), backup/restore (Phase 4, needs
  this storage abstraction as a foundation), or start the calendar/
  booking module (Phase 5, entirely greenfield, most brief real
  estate) — proceeding to whichever has the most leverage next.

- **2026-08-19 (continued further still)**: Landed manual local backup +
  fresh-install restore (ADR 0004). New `internal/db/backup.go`
  (JSON-lines table dump/restore via Postgres `row_to_json`/
  `json_populate_record`) and `internal/httpapi/backup.go` (zip assembly,
  SHA-256 checksums, manifest versioning). Found and fixed a real bug
  during live verification: the dump query originally did `ORDER BY id`
  unconditionally, which broke on `organization_members` (composite
  primary key, no `id` column) — caught by actually running it against
  Postgres, not by reading the code. Full live round-trip verified across
  three separate throwaway Postgres instances: populate → backup →
  restore onto a fresh instance → login, projects, roles, submission
  JSONB, and uploaded file bytes all confirmed correct; restore-onto-
  active-instance correctly refused; both a corrupted zip and a
  validly-zipped-but-tampered entry correctly rejected (confirming the
  app-level SHA-256 check isn't redundant with the zip format's own CRC).
  `go build`/`vet`/`test ./...` green. All test containers and temp files
  cleaned up. Not done: scheduled/automatic backups, S3 as a backup
  destination, restore-over-an-active-install, encryption — see the
  Phase 4 checklist above for the precise scope line. Next: either keep
  building out Phase 4 (S3 backup destination, scheduling) or move to
  Phase 5 (calendar/booking, entirely greenfield) or Phase 3's remaining
  items (API keys with scopes, file-extension validation) — whichever is
  tackled next, keep verifying against a real Postgres + live server.

- **2026-08-19 (continued yet further)**: Landed the calendar/booking
  core (Phase 5 kickoff, ADR 0005) — the largest greenfield piece of the
  program so far. New `internal/availability` package: a pure-Go,
  timezone-aware slot-computation engine with 7 unit tests, including two
  that specifically straddle real 2026 DST transitions (America/New_York
  spring-forward 2026-03-08, fall-back 2026-11-01) and assert the exact
  expected UTC instant on each side — not just "it runs without error."
  New tables (migration `0011_calendar_booking.sql`): `event_types`,
  `availability_rules`, `availability_overrides`, `bookings`. Conflict
  detection is a Postgres `EXCLUDE USING gist` constraint (needs
  `btree_gist`), not application logic — makes double-booking impossible
  even under concurrent requests, verified live by attempting an exact
  double-book (409) and a buffer-adjacent booking that overlaps once
  buffers are applied (also 409, and this wasn't even slot-aligned —
  proves the constraint catches arbitrary overlaps, not just exact slot
  matches). Full public booking flow wired and live-tested: create event
  type with weekly hours → query public slots → book → reschedule (old
  slot frees, new slot blocks) → cancel via manage token (idempotency
  checked — cancelling twice fails cleanly, not a 500) → admin-side
  cancel from the authenticated dashboard → date-based override blocking
  a whole day → all verified against a real running server, not mocked.
  Also fixed a real production bug before it could ship: Alpine's
  `alpine:3.20` (this repo's API base image) has no `tzdata` package, so
  `time.LoadLocation` for any non-UTC zone would have silently failed in
  prod despite working in local dev — fixed via a `time/tzdata` blank
  import in `cmd/server/main.go`. Added the four new tables to the
  backup allowlist and **re-verified the full backup→restore round trip
  with calendar data included**: booking data, availability rules, and
  the date override all survived a restore onto a completely fresh
  instance, and — the part that actually mattered to test — the EXCLUDE
  constraint was confirmed still enforced on the restored instance (a
  fresh double-booking attempt post-restore correctly got a 409).
  `go build`/`vet`/`test ./...` green throughout. All test containers and
  temp files cleaned up.

  **Not done in this slice** (Phase 5 continues in future sessions):
  team/round-robin scheduling (§10), external calendar sync — Google/
  Outlook/ICS import for busy-time detection (§14, genuinely needs
  credentials this environment doesn't have — will implement the adapter
  framework + config UI when picked up, not fabricate credentials),
  `.ics` file generation for confirmations (§15 — straightforward,
  just not built yet), reminder delivery (booking confirmations/
  cancellations aren't yet wired to the existing Telegram notifier),
  the calendar UI/dashboard views (month/week/day — this slice is
  API-only, no frontend), and forms↔calendar integration events (§16).
  Conflict detection is also still scoped per-event-type, not per-host-
  across-all-their-event-types — see the ADR's stated limitation.

- **2026-08-19 (continued yet further, calendar fast-finish)**: Per user
  request to prioritize finishing Calendar over starting the Zulivio
  integration. Landed the full frontend (`/calendar` dashboard,
  `/book/[eventTypeId]` public flow, `/book/manage/[token]`), `.ics`
  generation, and Telegram booking reminders — see the Phase 5 items
  above for what was verified and how. Also closed two pre-existing doc
  gaps found along the way: `docs/api.md` never documented
  backup/restore or calendar endpoints (both added now), and its opening
  line still said "one account per instance, single-tenant" — stale since
  the organizations work landed earlier this session (fixed to describe
  the real one-organization-per-instance model). Phase 5 is now genuinely
  usable end-to-end by a real customer, not just API-complete. Next: the
  user asked to move to a **simplified** Zulivio integration next — not
  the full bidirectional event-bus design from Phase 6's original scope,
  but pushing new Submify submissions into Zulivio's *existing*
  `POST /api/v1/leads` endpoint using Zulivio's *existing* personal API
  key mechanism (no new Zulivio-side code needed) — plus a separately
  requested feature: per-project email notifications (configurable sender
  + a recipient address) for form submissions, which doesn't exist in
  Submify at all yet. Both are queued up next.

- **2026-08-19 (continued yet further, Zulivio integration)**: Landed the
  simplified Zulivio integration the user asked for (ADR 0006) — new
  `internal/zulivio` package, `projects` table gains
  `zulivio_enabled`/`zulivio_api_url`/`zulivio_api_key` (migration
  `0012_project_zulivio.sql`), a settings panel added to the Projects
  page. **Verified with a genuine live cross-product test**, the
  strongest verification done in this program so far: logged into a real
  running Zulivio instance (still up from the earlier sidebar-redesign
  session), generated a real personal API key via its actual API,
  configured it on a fresh Submify instance's project, submitted a real
  form through `/api/submit`, and confirmed via Zulivio's own
  `GET /api/v1/leads` that the lead landed correctly — right name/email/
  phone/company mapping, `source: "Submify: Default"`, the unmapped
  `message` field preserved in `notes`, and a real owner already assigned
  by Zulivio's own assignment-rule engine (proving `autoAssign: true`
  actually triggered Zulivio's existing logic, not just that the field
  was accepted). `go build`/`vet`/`test ./...` and `tsc`/`next build`
  both green. `docs/api.md` updated with the new PATCH field and a full
  "Zulivio integration" section. All test containers/temp files cleaned
  up (the Zulivio docker stack was left running from the earlier sidebar
  session — reused rather than rebuilt).

  **What's left, honestly**: this is the simplified version the user
  explicitly asked for instead of the original Phase 6 scope — no event
  bus, no configurable field mapping, no dedupe, no delivery-status UI,
  no Zulivio-side service-account credential type. All still open if the
  full integration is ever wanted later; ADR 0006 documents the tradeoff.

  **Also still queued, requested separately by the user mid-session**:
  per-project email notifications (configurable sender + a recipient
  address, delivering form submissions via email) — Submify has zero
  email-sending capability today (Discovery: "Email notifications aren't
  built in"). Next up.

- **2026-08-19 (continued yet further, email notifications — final item
  requested this session)**: Landed per-project email notifications (ADR
  0007): `email_notifications_enabled`/`smtp_host`/`smtp_port`/
  `smtp_username`/`smtp_password`/`smtp_from_email`/
  `notification_recipients` on `projects` (migration
  `0013_project_email_notifications.sql`), new `internal/mailer` package
  (stdlib `net/smtp` + `crypto/tls`, no new dependency, handles both
  STARTTLS-on-587-style and implicit-TLS-on-465-style automatically by
  port), wired into the submit flow alongside Telegram/Zulivio, and a
  matching settings panel on the Projects page. **Verified against a
  real SMTP server** — spun up a throwaway MailHog container (a
  standard, widely-used fake-SMTP dev tool, not a live external
  provider), configured a fresh Submify project to point at it,
  submitted a real form, and confirmed via MailHog's own API that a
  correctly-formed email actually arrived: right `From`, both
  `notification_recipients` in `To`, subject naming the project, and a
  formatted plain-text body with every submission field. This proves the
  SMTP client code is genuinely correct (protocol handshake, auth,
  envelope, body) — not just that a request was attempted. The
  implicit-TLS (port 465) code path was written to the same standard
  pattern but not separately live-tested (no local test server for that
  variant was readily available) — noted honestly in ADR 0007 rather
  than silently assumed equivalent.

  This closes out every feature explicitly requested in this extended
  session: calendar/booking (finished end-to-end), the simplified
  Zulivio integration (verified live, cross-product), and email
  notifications (verified live, real SMTP delivery). `go build`/`vet`/
  `test ./...` and `tsc`/`next build` all green throughout; all test
  containers and temp files cleaned up after each verification.

  **What's genuinely still open** for the overall 93-section program
  (unchanged by this session's work, restated for anyone picking this up
  fresh): the full original Phase 6 scope (event bus, dedupe, service
  accounts) if ever wanted beyond the simplified Zulivio push; Phase 3's
  remaining items (scoped API keys, S3 exercised against a real bucket);
  automatic/scheduled backups and S3 as a backup destination; audit
  logs; MFA; the full security audit (Phase 9); the full test suite
  beyond what individual features got (Phase 10); all documentation
  deliverables (README rewrite, user manual with screenshots,
  ARCHITECTURE.md, SECURITY_AUDIT.md); the marketing site refresh; MCP
  server on Submify; CasaOS packaging; and release prep. This program is
  far from 100% of the original brief — it is, however, now several
  real, independently-verified, end-to-end-working features deep, with
  nothing faked or left as scaffolding.

- **2026-08-20**: User reported the authenticated app "looks like a
  website" and asked for a real app-shell redesign, quick-access buttons,
  and a Google-Calendar-style calendar UI where the user can track their
  own day's work/reminders — closing out Phase 5's Calendar UI line and a
  slice of Phase 7. Landed all three: a new `app/(app)/` route group +
  sidebar/topbar app shell replacing every page's duplicated marketing-nav
  wrapper; a new personal-events/reminders backend feature (ADR 0008,
  migration `0014_personal_events.sql`) with real Telegram reminder
  delivery via a new background job; and a full month/week/day calendar
  grid unifying personal items with existing bookings.

  **Verification, in order**: `go build`/`vet`/`test ./...` green. Live
  against a real throwaway Postgres: created a second user in the same
  organization and confirmed they cannot see/edit/delete the first user's
  personal items (org+user-scoped, not just org-scoped); exercised the
  reminder job directly (real Telegram API 401 from a fake token, retried
  3x per `internal/telegram`'s existing pattern, `reminder_sent_at`
  correctly idempotent); full backup→restore round trip onto a completely
  separate fresh instance, including a *pending* (not-yet-fired) reminder,
  which correctly survived and remained pending. `tsc --noEmit`, lint, and
  a real `next build` all clean. Built the actual production Docker images
  (`docker compose build api web`, not just local toolchains) — this
  repo's own `./data/postgres` already held real initialized data from a
  prior run, so live functional testing used a fully isolated compose
  stack (`-p submify-verify`, separate container names/ports/volumes) to
  avoid touching it; torn down and cleaned up afterward, original data
  never touched. Real Playwright session against that isolated stack:
  registered a user, walked month/week/day views, created a task with a
  15-minutes-before reminder, confirmed it round-trips correctly through
  edit, confirmed cross-view consistency, confirmed the pre-existing Event
  Types tab still works unchanged, and checked responsive layout at
  375/768/1440px (sidebar correctly collapses to a slide-over drawer on
  mobile).

  **Found and fixed three real bugs this way, none catchable by
  `tsc`/`build`/lint** — logged in detail in Phase 5/7's checklist items
  above, restated briefly here since this is exactly the kind of thing
  future sessions should keep watching for: an infinite refetch loop from
  an unmemoized `Date` object breaking a `useMemo`/`useCallback` chain
  (hammered the API into 429s); every inactive-state raw `<button>`
  rendering solid brand-purple because of `globals.css`'s unscoped global
  `button` reset (same bug class as one already logged in this file for
  the original booking pages — now hit again on new components, worth
  remembering as a standing hazard in this codebase specifically); and
  Day view's date range starting from "right now" instead of local
  midnight, silently hiding same-day items earlier than the current time.

  **What's genuinely still open**: drag-to-reschedule on the grid,
  recurring personal events, and Phase 7's remaining scope (Settings
  reorganization into documented sections, onboarding/empty/error states,
  a full accessibility pass — this session's a11y check was inconclusive:
  the standalone `accesslint` scanner has no way to carry over an
  authenticated session, so it audited the unauthenticated `/login`
  redirect instead of the real pages; the Playwright accessibility-tree
  snapshots taken during live verification did confirm a `main` landmark,
  `h1`, `navigation` landmark, and `aria-label`s on icon-only buttons are
  present, but that's not a substitute for a real automated pass). Nothing
  else in the overall program changed this session.

- **2026-08-20 (continued, same-day follow-ups)**: Four more requests in
  the same session.

  **Security**: fixed a critical CodeQL finding (`go/email-injection`,
  alerts #1/#2) in `internal/mailer` — `subject`/`from`/`to` were
  interpolated directly into raw RFC 5322 header lines, so a CRLF in
  `project.Name` or `NotificationRecipients` could smuggle an extra header
  (hidden Bcc, spoofed Reply-To) into a notification email. Fixed with a
  header-value sanitizer (strips CR/LF, body left untouched — it can't
  smuggle a header) and address validation before the low-level
  `smtp.Client.Mail()`/`Rcpt()` calls in the hand-rolled implicit-TLS path,
  which — unlike stdlib `smtp.SendMail` on the other path — had no built-in
  CRLF check at all. New `mailer_test.go` proves it (checking for an
  actual injected header *line*, not just the naive "does the string
  contain Bcc:" substring check, which would falsely flag safely-stripped
  input). Also fixed the one open Dependabot alert across every repo on
  the account (not just this one) — a high-severity `deepmerge-ts` stack-
  exhaustion CVE in `construction-erp`, unrelated to Submify itself.

  **UX course-correction, logged so a future session doesn't repeat the
  confusion**: user initially asked to remove the Blog/Docs sections
  because "the app looks like a website," which was reasonably read as
  "delete the marketing site's Blog/Docs" — implemented, then the user
  clarified submify.nodedr.com (the pasted homepage) **is** the intended
  public marketing site and should keep Blog/Docs; only the *authenticated
  app itself* (which never linked to them except one `/docs/contact-proxy`
  reference from the Projects page) needed to stay clear of that. Fully
  reverted the deletion (nothing was committed yet) and instead just
  removed the `/docs/contact-proxy` link from the Projects page header —
  the docs page itself, and the whole public Blog/Docs section, are
  untouched. Worth remembering: "make the app not look like a website" and
  "the public marketing site" are two different surfaces in this repo, and
  a request naming one can easily be misapplied to the other.

  **Projects page decluttering**: the per-project card in `/projects`
  unconditionally rendered every settings section at once — Origins,
  Telegram, S3, Zulivio, Email, Client Portal, each with multiple always-
  visible input fields — for every project, all the time. Restructured
  into a collapsed-by-default "Manage settings" panel using the existing
  `Tabs` primitive (one tab per settings area), plus removed a fully
  decorative always-visible "••••••••" masked-key placeholder pair that
  conveyed zero information (the sidebar's real Copy public/secret key
  buttons already cover that). Status badges (Telegram/S3/Zulivio/Email,
  now also Portal) stay visible at a glance without opening anything.

  **Marketing site**: added a real one-command installer section
  (`components/landing/install-command.tsx`, OS-tabbed macOS/Linux/
  Windows, matching the pattern already used on this machine's other
  NodeDR product sites like nodedr-pos) to the homepage. Windows had no
  installer at all before this — added `install.ps1` at the repo root
  (mirrors `install.sh` exactly: requires Docker Desktop + git already
  installed, same as the Linux/macOS installer's own choice not to auto-
  install system dependencies) alongside the pre-existing
  `scripts/Compose-Up.ps1` wrapper it now calls. New reusable
  `CopyButton`/`CopyableCode` components, applied to every real runnable
  code block on the public docs pages (the AI-builder reuse-prompt, the
  JSON submit example, the LAN-exposure env-var and `docker compose up -d`
  examples) — 4 blocks on `/docs`, 1 on `/docs/contact-proxy`.

  **CORS gap for the public booking API**: user asked to confirm calendar
  booking is actually callable "from API when connected through a
  website." Investigation found a real gap: `/api/submit` already allows
  any browser `Origin` by design (`CORS_PUBLIC_SUBMIT_ANY_ORIGIN`, for
  exactly this reason — embedding on external sites), but the public
  booking routes (`/api/v1/public/event-types/*`, `/api/v1/public/
  bookings/*`) had no such carve-out — an external site trying to `fetch()`
  them directly (as opposed to just linking to `/book/{id}` as a plain
  page, which never needed CORS) would get a 403 unless its origin was
  explicitly allowlisted. Both surfaces share the same trust model (no
  cookies; an unguessable ID/token is the real access control), so this
  was a real inconsistency, not intentional hardening. Added a new,
  independently-toggleable `CORS_PUBLIC_BOOKING_ANY_ORIGIN` flag (default
  `true`) rather than piggybacking on the submit-specific flag, and
  widened the preflight `Access-Control-Allow-Methods` to include `GET`
  (booking has real GET routes — event info, slots — that submit never
  needed). New `cors_middleware_test.go` — the first CORS tests in this
  repo — covers the any-origin behavior, the preflight method list, that
  authenticated routes still correctly reject unallowlisted origins
  (regression guard), and that the two any-origin flags are independently
  toggleable.

  **Verification**: `go build`/`vet`/`test ./...` (30 tests, up from 17)
  and `tsc`/lint/`next build` all green throughout. Nothing in this slice
  needed a live Postgres/Docker re-verification — the CORS fix is fully
  covered by real `httptest`-based HTTP semantics tests, and the frontend
  changes were spot-checked live via Playwright against a local dev
  server (clipboard-write itself can't be verified in the sandboxed
  headless test browser — permission denied — but it's the identical
  `navigator.clipboard.writeText` pattern already used elsewhere in this
  same codebase, e.g. `copyKey`/`copyLink` on the Projects/Calendar pages).

- **2026-08-20 — Blog/Docs actually removed from the public site (a
  reversal, confirmed via AskUserQuestion)**: the earlier entry above
  ("Blog & Docs stay on the public marketing site") is superseded. The
  user pasted the live homepage again and asked to remove Blog/Docs; given
  the prior explicit correction on this exact point, this was confirmed
  rather than assumed — offered "de-emphasize only" vs. "actually delete,"
  and the user chose deletion. `app/blog`, `app/docs`, and their
  now-unused support components (`blog-shell.tsx`, `docs-chrome.tsx`,
  the already-dead `components/nav.tsx`) are gone; `sitemap.ts` no longer
  lists them; the two dangling `/docs` links on `/register` and `/login`
  now just link home. Lesson for a future session: don't re-apply the
  older "keep Blog/Docs" call without checking first — see
  `feedback_submify_public_site_now_app_like` in auto-memory.

  Homepage also restructured to read as a product/app landing page
  instead of a content-marketing site (matching nodedr-pos/OrderRestro/
  Zulivio's own homepages): dropped the "form paradox" problem/solution
  narrative, the "Core features" spec table, the "Architecture" cards,
  the auto-rotating "How data flows" stepper, the full "Contact" section,
  and the FAQ — kept and tightened the hero, a compact "How it works"
  grid, the real install flow, one feature-card grid (with a new
  "Security first" card folded in), and one CTA. Footer keeps the
  existing branding/"made by"/copyright block, swapping the deleted
  Blog/Docs links for compact "Documentation" (→ GitHub) / "Support"
  (→ nodedr.com/contactus) links, same as the sibling products' pattern.

  Also added the sibling products' "Contact support" / "made by Nodedr
  Infotech Private Limited" sidebar footer to the authenticated app
  itself (`components/app-shell/sidebar.tsx`) — the logo was already
  there from the earlier app-shell rebuild, this was the missing half.

  Verified live: registered a throwaway account, confirmed `/docs` and
  `/blog` no longer resolve as real routes, confirmed nav/footer links,
  confirmed the sidebar footer renders. `next build` clean. One stray
  side-effect caught and fixed during verification: running `pnpm exec`
  commands against this npm-managed repo left a spurious
  `apps/web/pnpm-lock.yaml` and pnpm-touched `node_modules` — removed the
  lockfile and reinstalled with `npm install` to restore the real
  package-manager state before committing.

- **2026-08-21 — In-app "What's New" menu added, calendar update announced.**
  A follow-up request asked to "add a documentation page" and write up the
  calendar update on the Submify website — that would have directly
  reversed the 2026-08-20 Blog/Docs removal above, so it was surfaced via
  AskUserQuestion instead of assumed; the user chose an in-app changelog
  over touching the public site. Added `lib/whats-new.ts` (a small,
  factual entries array — cross-checked against `docs/api.md`'s Calendar &
  booking section rather than written from memory) and
  `components/app-shell/whats-new-menu.tsx` (Sparkles icon in the topbar,
  unseen-dot tracked in `localStorage`, same last-seen convention as the
  dashboard's submission banner), wired in next to `QuickAccessMenu`.
  Verified live: real Postgres + `go run ./cmd/server` + `next dev`,
  registered a throwaway account, opened the menu (dot cleared, content
  matched), reloaded (dot stayed cleared). `next build` clean.

- **2026-08-21 — Local Docker instance rebuilt to close a drift gap; production
  cutover deliberately deferred.** A request to wire a "book a meeting" flow
  into the nodedr.com marketing site surfaced two real findings, not just a
  feature request: (1) the public `api.nodedrdev.com` domain — the shared
  `/api/submit` backend every Nodedr marketing site depends on — is still
  serving an old, unrelated Vercel-hosted Submify build with no calendar
  support at all, completely disconnected from this repo; (2) that old
  deployment has its own separate database, so any DNS cutover would
  invalidate every live client site's `pk_live_...` key simultaneously.
  Confirmed the new `/api/submit` handler (`handlers.go:761`) uses the same
  `x-api-key: pk_live_*` contract, so a cutover is code-compatible — but the
  user explicitly deferred the actual DNS/Cloudflare-Tunnel migration
  (real blast-radius risk to unrelated client businesses) rather than have
  it done under a fast/auto-mode pass. Scoped down to: rebuild and restart
  the **local** CasaOS-managed Docker Compose stack only (`docker compose
  build && up -d`, no `-v`, existing Postgres volume untouched) to close a
  ~6.5-hour drift between the running containers and HEAD. Verified: build
  clean, containers recreated without data loss, no migration errors,
  `/calendar` and `/book/<id>` both still 200 post-rebuild. The
  `api.nodedrdev.com` cutover remains open — needs a real migration plan
  (recreate/import every existing client project + key) before any DNS
  change, not attempted here.

  Also answered a scoping question while here: calendar/booking rows are
  keyed by `organization_id` (`db/calendar.go`), so a client shared into an
  org via the existing collaborator model would see both submissions and
  bookings together — but the **view-only client portal** (`docs/page.tsx`
  "Client portal" section) is explicitly submissions-only by design ("and
  nothing else"), so portal-based clients do *not* currently see bookings
  through that link. Flagged as a real gap between what's built and what
  was asked, not silently assumed to already work.

- **2026-08-21 — Client portal calendar closes the gap flagged above: a
  portal visitor can now view (not manage) their organization's real
  bookings.** Direct follow-up to the same-day entry above and to an
  explicit request: "Clients should see their calendar bookings and use
  full calendar features." That phrasing is ambiguous between a full
  read-only *viewing* experience and actual booking management
  (reschedule/cancel) by the portal visitor — defaulted to the former
  (matching the portal's existing "view and export, nothing else, no
  delete rights" posture) rather than silently granting write access to
  real scheduled meetings, and recorded as
  `docs/decisions/0010-portal-calendar-read-only.md`.

  Backend: two new `PortalGuard`-protected, read-only routes —
  `GET /portal/event-types` and `GET /portal/bookings?from=&to=`
  (`apps/api/internal/httpapi/portal_calendar.go`). `PortalGuard`
  (`portal.go`) now also resolves and stashes `portal_organization_id`
  from the session's project, since bookings/event types are keyed by
  `organization_id`, not `project_id` — no such column exists on either
  table, so a portal session's calendar view is necessarily
  organization-wide, not scoped to just that one project's client. Both
  responses are deliberately minimized: no `manage_token` (would let a
  portal visitor reschedule/cancel a real booking via the existing
  `/public/bookings/:token/*` flow), no `attendee_email`/`notes` (would
  leak the org's *other* clients' contact details to whoever holds this
  one project's portal password). Neither handler touches
  `personal_events` (ADR 0008) at all — verified live, not just by code
  inspection.

  Frontend: the dashboard's calendar grid components (`MonthView`,
  `TimeGridView`, `MiniCalendar`, `BookingDetailsDialog`,
  `buildCalendarEntries`) were already prop-driven, not fetching their own
  data, so they dropped into `/[slug]` with only one real coupling fixed —
  `CalendarEntry`/`BookingDetailsDialog` assumed the dashboard's full
  `Booking` type (required `attendee_email`). Generalized to a structural
  `BookingLike` type (`components/calendar/entries.ts`), satisfied by both
  the dashboard's `Booking` and the portal's new minimized `PortalBooking`
  — no duplicate dialog/grid components. Added a "Submissions"/"Calendar"
  tab to `app/[slug]/page.tsx` with its own month/week/day navigation
  state (no URL persistence, unlike the dashboard's version — the portal
  doesn't need deep-linkable calendar state) and its own `lib/portal.ts`
  client functions (`portalEventTypes`, `portalBookings`).

  Docs updated: `docs/api.md`'s Client portal section (new endpoints +
  scope note), `acweb`'s `submify.nodedr.com/app/docs/page.tsx` Client
  portal section (no longer says "and nothing else" — now describes
  read-only calendar visibility and the organization-wide caveat),
  `docs/decisions/README.md` index backfilled for 0008-0010 (0008/0009
  were missing from the index before this).

  **Verified live**: real Postgres via Docker + `go run ./cmd/server` +
  `next dev`. Registered a throwaway account, created a real project with
  a real event type and a real confirmed booking (attendee "Jane Client"),
  created a personal reminder as the org member
  ("SECRET-PERSONAL-REMINDER..."), then logged into that project's real
  portal with its real portal password. Confirmed: `GET /portal/bookings`
  returns the booking stripped of `manage_token`/`attendee_email`/`notes`
  and never contains the personal reminder text (grep-verified, 0
  matches); an unauthenticated request to `/portal/bookings` gets `401`;
  the portal cookie session cannot reach the dashboard's
  `/bookings/:id/cancel` endpoint (`401`, no bearer token) and no portal
  cancel/reschedule route exists at all (`404`). In the browser: month
  view shows the real booking chip on the right day; clicking it opens a
  read-only dialog showing "Jane Client" (no email), "Zoom", and "Read-only
  — contact the organization directly to reschedule or cancel." (no
  "manage from Event Types tab" dashboard text); Week and Day views both
  render the same booking at its correct time slot; Today/Prev/Next
  navigation moves between months/weeks/days correctly (confirmed
  Day-view Next advanced from Fri Aug 21 to Sat Aug 22 with an empty
  grid); switching back to the Submissions tab and back to Calendar
  doesn't leak or duplicate state; checked responsive layout at 375px
  (no horizontal overflow). `go build ./...` and `go vet ./...` clean;
  `npx tsc --noEmit` clean in both `apps/web` and the `acweb` docs repo;
  `next build` clean (0 errors, 0 warnings). Local-only: a temporary
  same-origin dev proxy was added to `next.config.js` purely to test the
  portal's HttpOnly cookie under `next dev`'s separate port from the API
  (SameSite cookie behavior needs same-site origins to test realistically)
  — reverted before commit, confirmed via `git diff` showing no changes to
  that file. Did not touch the production deployment or any file outside
  this repo and the one `acweb` docs page, per this project's standing
  "don't touch production" instruction.

- **2026-08-21 — CasaOS/ZimaOS package republished to `0.2.0`, closing the
  gap between the store listing and the two features that landed this
  session (Calendar & Booking UI, read-only portal calendar).** The
  previously-published images (`ghcr.io/raktim94/submify-{api,web,nginx}:0.1.0`)
  predated both. Built all three from current `main` HEAD (`6114afd`) as
  real multi-arch images (`linux/amd64` + `linux/arm64`, matching the
  package's declared `architectures`) via a `docker-container` buildx
  builder with QEMU (`tonistiigi/binfmt`) for arm64 emulation, and pushed
  `0.2.0` + `latest` tags for all three to GHCR (`docker login ghcr.io`
  via `gh auth token`). Pushed manifest-list digests: `submify-api@sha256:
  8b5c8e1bdc1114fdcc7a1b1fecde9b33c42e9cf15648024a5f2a1d77878d4f20`,
  `submify-web@sha256:6f918c5ef49a130d1eb8b7d854fb7235891a87b266eae9b19e893ed3a5a9ef4f`,
  `submify-nginx@sha256:1c61a48afe9c3bb49cd669262e9e7eb7d7801d3e5cf5055c138ef0f2986600b3`
  — each confirmed live via `docker manifest inspect` (both amd64/arm64
  platform entries present) after a fresh `docker rmi` + `docker pull`
  (not just trusting `docker push`'s own success message).

  `casaos/docker-compose.yml` updated: all three `image:` refs bumped to
  `0.2.0`, `x-casaos.version` → `"0.2.0"`, `update_at` → `"2026-08-21"`,
  and a new `0.2.0:` line added to `release_notes` (full calendar/booking
  UI, event types, public booking pages, `.ics` export, Telegram
  reminders, and the read-only client-portal calendar). The top-level
  `description` already named calendar/booking prominently — left as-is,
  not rewritten.

  **Verified against the actual published `0.2.0` images**, not local
  dev builds: stood up an isolated throwaway stack (`docker compose -p
  submify-test-verify`, all four container names + bind-mount sources +
  the published port remapped to a scratch dir under `/tmp` and port
  `25120`, since a real `submify-{db,api,web,nginx}` dev stack was already
  running on this host and had to stay untouched — confirmed still up
  and healthy afterward). Confirmed live: the `POSTGRES_PASSWORD_FILE`/
  `JWT_SECRET` first-boot secret-generation entrypoints both fired
  correctly; registration → login → default project listing all worked
  through nginx on the mapped port; created a real event type with weekly
  availability rules, fetched public slots, and booked a real slot via
  the public booking API; enabled the project's client portal, logged
  into it, and confirmed `GET /portal/bookings` returns the booking
  correctly (attendee name, event title, time) while genuinely omitting
  `manage_token`/`attendee_email`/`notes` — matching ADR 0010's read-only
  design — and that an unauthenticated request to the same endpoint
  correctly gets `401`; also confirmed `.ics` download and the portal's
  web page (`/verify-slug`) both return `200`. `docker compose -f
  casaos/docker-compose.yml config -q` (the same structural check
  `IceWhaleTech/CasaOS-AppStore`'s CI runs) passed cleanly. Torn down the
  throwaway stack and deleted the scratch directory afterward.

  **Explicitly out of scope, not done here**: no PR was opened against
  `IceWhaleTech/CasaOS-AppStore` — confirmed via `gh api repos/Raktim94/
  CasaOS-AppStore/contents/Apps` that no `Submify` entry exists there yet,
  so the app still isn't listed on the actual public store. That
  submission (fork, `Apps/Submify/` directory, PR against `main`, per the
  established pattern from nodedr-pos #996 and OrderRestro #1001) remains
  a separate future step if the user wants it publicly listed.

- **2026-08-26 — "Connecting calendar booking to your website" guide added
  to `docs/api.md`.** Request was to document how to hook booking up to an
  external site "using the API keys." Before writing, surfaced two things
  via AskUserQuestion rather than assuming: (1) where the doc should live —
  this is the same shape of request as the 2026-08-21 entry above (adding
  a documentation page reverses the 2026-08-20 Blog/Docs removal), and the
  user confirmed **`docs/api.md`** (what the site's footer "Documentation"
  link already points to on GitHub), not the public site or in-app help;
  (2) a factual correction — checked `apps/api/internal/httpapi/` and
  confirmed the public booking endpoints (`/public/event-types/*`,
  `/public/bookings/*`) use the event-type ID as their access control, not
  an `x-api-key` (that header is only for `/api/submit` and Zulivio). User
  confirmed to write it correctly rather than force an API-key framing.

  Added a new "Connecting calendar booking to your website" subsection
  right after the existing CORS paragraph in the Calendar & booking section
  of `docs/api.md`: where to find the event-type ID (dashboard → Calendar →
  Event Types → Copy Link — confirmed against `event-types-panel.tsx`'s
  actual `copyLink`/`/book/${id}` behavior, not guessed), two integration
  paths (hosted `/book/{id}` link/iframe for zero-code embedding, and a
  full `fetch()`-based custom-widget example covering event-type lookup,
  slots, booking creation, and the `409` double-booked-slot case), and a
  CORS note pointing at `CORS_PUBLIC_BOOKING_ANY_ORIGIN`/`ALLOWED_ORIGINS`
  for locked-down instances. No code changes — documentation only.
