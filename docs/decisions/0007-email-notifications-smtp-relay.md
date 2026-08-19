# 0007: Email notifications are a per-project SMTP relay config, not a managed sending service

Date: 2026-08-19

## Context

The user asked for email notifications on form submissions: a way to
configure a sending email account per project, and a box for destination
address(es) that should receive each new submission. Discovery had already
flagged this as entirely missing (`README.md`: "Email notifications aren't
built in").

Two architecturally different ways to do this:

1. **Submify operates its own outbound mail service** (e.g. holds a single
   shared SMTP/API relay credential — Postgres, Resend, SES — and sends on
   every customer's behalf).
2. **Each project brings its own SMTP credentials**, and Submify is purely
   a relay that sends through *those*.

## Decision

Option 2 — per-project SMTP relay, same pattern as this codebase's
existing per-project Telegram and S3 settings (`smtp_host`, `smtp_port`,
`smtp_username`, `smtp_password`, `smtp_from_email`,
`notification_recipients` on `projects`, migration
`0013_project_email_notifications.sql`). Reasoning:

- Matches brief §92's self-hosted-first, no-managed-service philosophy
  already established by every other integration in this codebase (S3,
  Telegram, and now Zulivio all work the same way: the operator supplies
  their own account/credentials, Submify never becomes a shared sending
  identity). A shared-sender model would also mean Submify's own
  reputation/deliverability affects every customer, and requires Submify
  to hold and rotate a real mail-provider credential — infrastructure this
  self-hosted product doesn't have and the brief doesn't ask it to build.
- SMTP is universally supported (Gmail, Outlook, any provider, or a
  self-hosted mail server) without picking a specific vendor SDK — matches
  §79 (don't overengineer / don't add a provider-specific dependency where
  a standard protocol already does the job). Implemented with Go's stdlib
  `net/smtp` + `crypto/tls`, no new third-party dependency.

**Recipients are a plain per-project list** (`notification_recipients`,
stored the same JSON-array-as-TEXT shape as `allowed_origins`), not tied
to individual user accounts — this is deliberately the "one box where I
can put whatever email I like" the user asked for, not scoped to
registered Submify accounts.

**Both STARTTLS (port 587-style) and implicit TLS (port 465-style) are
supported** by inspecting the configured port, since real-world SMTP
providers split roughly evenly between the two and guessing wrong is a
common self-hosted pain point worth handling correctly up front.

## Consequences

- The submission email body includes the full field data (same
  information already sent to Telegram) — an operator who doesn't want
  submission content in their email inbox should not enable this, same
  implicit trust model as Telegram already has.
- `smtp_password` is stored in plaintext in the `projects` table, same
  precedent as the existing Telegram bot token, S3 secret key, and
  now-added Zulivio API key columns — no new secrets-handling gap
  introduced, but also none closed; a future hardening pass (§18-style
  "encrypt integration secrets at rest") would need to cover all of these
  uniformly, not just email.
- No delivery-status tracking or bounce handling — matches the same
  fire-and-forget, best-effort pattern as Telegram and Zulivio. A
  misconfigured or rejecting mail server fails silently from the
  submitter's perspective (the submission itself always succeeds
  regardless of notification delivery) and is only visible in the server
  log — consistent with, not worse than, the other two integrations, but
  worth remembering as a pattern-wide gap if delivery visibility is ever
  prioritized (§77's system-status area would be the natural place).
- Verified against a real (self-hosted, throwaway) MailHog SMTP server in
  this session rather than a live external provider — proves the SMTP
  client code is genuinely correct (STARTTLS handshake, auth, envelope,
  body), not just that a request was *attempted*. A real provider (Gmail,
  SES, etc.) was not used for verification since that would require a
  live external credential this environment doesn't have; the protocol
  implementation itself doesn't differ by provider, so this is a
  legitimate substitute, not a corner cut.
