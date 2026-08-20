# 0008: Personal calendar events are a separate, per-user-private table — not an extension of event_types/bookings

Date: 2026-08-20

## Context

The user asked for a real calendar UI (Google-Calendar-grade month/week/day
views, original visual identity per brief §6) plus a way for a logged-in
user to record their own agenda — a work task for the day, a note, or a
timed reminder that actually notifies them. The existing calendar schema
(`event_types`/`availability_rules`/`bookings`, migration `0011`) models
something structurally different: a host publishes bookable time slots and
an *external, unauthenticated attendee* books one. There was no concept of
a user's own private agenda item anywhere in the schema.

## Decision

New table, `personal_events` (migration `0014`), deliberately separate from
the booking system rather than bolted onto it:

- `organization_id` (tenant isolation, matches every other table) **and**
  `user_id` (privacy) — every store method (`ListPersonalEvents`,
  `PersonalEventOwnedBy`, `UpdatePersonalEvent`, `DeletePersonalEvent`)
  filters by both, so an item is invisible to every user except its
  creator, even other members of the same organization. This is the
  opposite default from `bookings`, which is intentionally
  organization-wide (any teammate can see/cancel any booking on the shared
  dashboard) — conflating the two would have made bookings and personal
  agenda items behave inconsistently depending on which table they landed
  in.
- `kind` (`event`/`task`/`reminder`, a `CHECK` constraint, not a separate
  table per kind) — these three are the same shape (a title, a time, an
  optional end, an optional reminder) with only display/behavior
  differences on the frontend (a task shows a checkbox via
  `is_completed`), not different data models.
- `ends_at` and `remind_at` are both nullable — a task or a bare reminder
  is a single point in time, not a range; forcing an artificial `ends_at`
  would have meant inventing a fake duration for the UI to then ignore.
- No recurrence (no RRULE, no repeat rules) in this version — every
  request explicitly asked for was satisfiable with single dated items;
  recurrence is real, separate complexity (expansion, exception dates)
  better scoped as its own follow-up if actually needed.

## Reminder delivery: real Telegram notification, not visual-only

Asked directly rather than assumed: the user confirmed a reminder should
fire an actual Telegram notification at `remind_at`, reusing the existing
per-user Telegram bot token/chat ID (`users.telegram_bot_token` /
`telegram_chat_id`, already used by `notifyHostOfBooking` for booking
reminders) — not a new notification channel.

This is the first real use of `StartBackgroundJobs()`, which was
previously an empty stub (`internal/httpapi/server.go`, confirmed by
reading it before writing this). Implemented as a single `time.Ticker`
goroutine (60s interval) calling `dispatchDueReminders()`, which sweeps
`personal_events` for `remind_at <= now() AND reminder_sent_at IS NULL`
(backed by a partial index, `idx_personal_events_due_reminders`, so the
sweep stays cheap regardless of table size) and fires
`telegram.NotifyAsync` exactly like `notifyHostOfBooking` does — silently
no-ops for a user with no Telegram configured, same fire-and-forget,
best-effort pattern as every other notification channel in this codebase
(Telegram for submissions/bookings, email via ADR 0007, Zulivio via ADR
0006). A ticker, not a cron library or job queue, per this repo's
established "no unnecessary infra" principle (same reasoning as the
in-memory upload-token store, ADR 0003) — a single-process instance with a
60s-granularity sweep doesn't need more than that.

`reminder_sent_at` makes the sweep idempotent: an item is marked sent
immediately after a dispatch attempt regardless of whether Telegram was
actually configured for that user, so an unconfigured user's past-due
reminder is swept exactly once and never retried forever. `UpdatePersonalEvent`
resets `reminder_sent_at` back to `NULL` whenever `remind_at` itself
changes (`reminder_sent_at = CASE WHEN remind_at IS DISTINCT FROM $9 THEN
NULL ELSE reminder_sent_at END`) — otherwise editing a reminder to a new
future time after its old time had already fired would silently never
notify again.

## Consequences

- Precision is ±60s (the ticker interval), not exact-to-the-second — an
  acceptable tradeoff for a personal reminder use case, and avoids a
  per-item scheduled-timer design that would need to survive process
  restarts correctly (a sweep-based design naturally self-heals: a restart
  just picks up whatever's due on the next tick).
- No retry/backoff if `telegram.NotifyAsync` itself fails after dispatch
  (e.g. Telegram's API is down for that one tick) — `reminder_sent_at` is
  still set, so a transient failure means that specific reminder is simply
  missed, not retried. Matches this codebase's existing tolerance for
  best-effort notification delivery (see ADR 0007's same tradeoff for
  email) rather than introducing a new retry-queue pattern for one feature.
- Added `personal_events` to the backup/restore allowlist
  (`internal/db/backup.go`) in the same slice, after `bookings` in
  FK-dependency order — a personal calendar with no backup coverage would
  have been a silent data-loss trap on any future restore.
