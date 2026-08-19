# Submify → Production-Grade Platform: Master Plan

Status: **Phase 1 complete. Phase 2 (Architecture) started — organizations/workspaces schema landed and verified.**
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
- [ ] Manual local backup (create + download)
- [ ] Automatic scheduled backups (daily/weekly/monthly, retention policy)
- [ ] S3 backup (endpoint/region/bucket/keys/prefix/retention + Test
      Connection before enabling)
- [ ] Restore from local backup, restore from S3 backup, fresh-install
      restore path
- [ ] Versioned backup manifest (product/backupVersion/appVersion/createdAt/
      dbVersion), integrity validation (checksums), safety backup before
      restoring over an active install, clear destructive-action warnings
- [ ] Encryption: implement only with vetted crypto, or explicitly document
      as a recommendation if not safely implementable now — never ship weak
      custom crypto

### Phase 5 — Calendar & Booking (§6–15)
- [ ] Event types (duration, location, availability, buffers, limits,
      custom questions, confirmation/cancellation/reschedule rules)
- [ ] Public booking pages (Event → Date → Time → Details → Confirmation),
      mobile-friendly, timezone-aware, SEO-safe where desired
- [ ] Availability engine: weekly recurring + overrides + blocked dates +
      buffers + min/max notice + slot intervals, UTC storage w/ DST handled,
      double-booking conflict detection — timezone/DST logic needs real
      automated tests, not spot checks
- [ ] Team scheduling (single/multi host, round-robin, pooled availability)
- [ ] Secure reschedule/cancel via signed links, not guessable booking IDs
- [ ] Reminder architecture (email/webhook/Telegram now; SMS/WhatsApp/Slack/
      Teams as future adapters — no provider-specific logic in booking core)
- [ ] Calendar UI: month/week/day/upcoming views. Design target (user spec,
      2026-08-19): Google-Calendar-grade density/polish and interaction
      feel — but an original visual identity, not a lookalike clone (the
      brief itself, §6, explicitly forbids copying another company's
      proprietary design). Build on shadcn/ui (already wired via the
      per-project shadcn MCP pattern — run `npx shadcn@latest mcp init
      --client claude` in this repo if not yet done) + this machine's
      `animation` skill (Framer Motion/GSAP) for drag-to-reschedule, view
      transitions, and smooth date navigation — no jank, no layout shift
- [ ] External calendar provider *architecture* (Google/Outlook/ICS) — only
      implement what's completable with credentials we actually have;
      otherwise ship the adapter framework + config UI/docs and say so
- [ ] `.ics` generation for confirmations

### Phase 6 — Integrations (§16, 28–36)
- [ ] Forms↔Calendar integration via internal events, not hard imports
- [ ] Zulivio native integration: event bus (form.created, form.submitted,
      submission.updated, booking.created/rescheduled/cancelled), field
      mapping UI, dedupe (email/phone/external id), retry queue on Zulivio
      unavailability (submission must never be lost) — auth via scoped
      API key/service token, never shared admin credentials
- [ ] Generic CRM integration path (REST/webhook/API keys) so customers
      aren't locked into Zulivio specifically
- [ ] Telegram notifications (bot token + chat ID, Test Notification, safe
      storage — never re-displayed after save, never logged)
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
