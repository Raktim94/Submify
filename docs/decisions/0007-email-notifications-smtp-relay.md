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
- Delivery visibility was originally absent (fire-and-forget, server log
  only); see "Delivery visibility" below for the follow-up.
- Verified against a real (self-hosted, throwaway) MailHog SMTP server in
  this session rather than a live external provider — proves the SMTP
  client code is genuinely correct (STARTTLS handshake, auth, envelope,
  body), not just that a request was *attempted*. A real provider (Gmail,
  SES, etc.) was not used for verification since that would require a
  live external credential this environment doesn't have; the protocol
  implementation itself doesn't differ by provider, so this is a
  legitimate substitute, not a corner cut.

## Delivery visibility (added 2026-10-16)

**The gap.** With fire-and-forget sends, an operator whose SMTP credentials
are wrong or revoked had no way to know notifications had stopped, short of
reading server logs.

**What SMTP can and cannot tell us.** Because each project brings its own
SMTP account, Submify only ever talks to the customer's relay. Two things
must be kept apart:

- **Accepted by the relay**: the relay returned a success reply after
  `DATA`. Submify observes this directly. It is a hand-off, not a guarantee.
- **Delivered to an inbox**: only the recipient's mail system knows. A relay
  can accept a message and later bounce it asynchronously, or the receiving
  side can silently junk it. Bounces arrive (if at all) as a separate
  message to the From/return-path mailbox, and complaints come through
  provider-specific feedback loops (SES/SNS, Postmark/SendGrid webhooks,
  ...). There is no standard, reliable way to get either across arbitrary
  SMTP providers, so Submify does **not** claim to detect bounces or
  complaints, and never labels SMTP acceptance as "delivered".

**Decision.** Record only what Submify can observe, as the *latest* attempt
per project on the `projects` row (migration `0016`): `email_last_status`
(`pending` | `accepted` | `failed` after the 3 retries), `email_last_status_at`,
and a short `email_last_error` (control characters stripped, SMTP password
redacted, ~200 chars). The email body and SMTP transcript are not stored.
The status is cleared when the project's email settings are saved, so a stale
failure from old credentials is not shown against new ones. It is exposed on
the existing project object (already scoped to the caller's organization) and
shown in the dashboard's Email tab. Concurrent submissions overwrite each
other; the field answers "is email working right now", not "what happened to
message X".

**Deliberately not done.** No per-message timeline, no separate ingestion
service, and no bounce/complaint handling. If a provider-specific integration
is added later (e.g. a signed SES/Postmark webhook), its states must be added
as distinct, clearly labelled *provider-reported* values (e.g.
`provider_bounced`), never merged into `accepted`/`delivered`, and only for
providers that supply an authenticated feedback mechanism.
