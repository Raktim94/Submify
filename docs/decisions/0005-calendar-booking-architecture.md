# 0005: Calendar/booking core — buffer-inclusive ranges for conflict detection, DB-level exclusion constraint, pure-Go availability engine

Date: 2026-08-19

## Context

Brief §6-15 asks for a full booking product: event types, an availability
engine, public booking pages, conflict detection, rescheduling/cancellation,
reminders, calendar views, and (where credentials allow) external calendar
sync. This is entirely greenfield — Discovery found no calendar/booking
code, tables, or concepts anywhere in the existing codebase.

Three decisions needed making before writing any code:

1. **How is double-booking actually prevented?** An application-level
   "check for conflicts, then insert" is a real TOCTOU race under
   concurrent requests — two people could both pass the check for the
   same slot microseconds apart and both get a confirmed booking. Brief
   §92 ("A customer should feel safe... schedule real appointments with
   it") makes this a correctness requirement, not a nice-to-have.
2. **How do per-event-type buffers (before/after) factor into conflict
   detection**, given they live on `event_types`, not `bookings`?
3. **How is DST correctness actually guaranteed**, not just assumed? Brief
   §9 explicitly calls this out as needing extensive testing.

## Decisions

**1. Conflict detection is a Postgres `EXCLUDE` constraint, not
application logic.** `bookings` has an `EXCLUDE USING gist (event_type_id
WITH =, tstzrange(busy_starts_at, busy_ends_at) WITH &&) WHERE (status =
'confirmed')` (migration `0011_calendar_booking.sql`, needs the
`btree_gist` extension for the `=` operator to combine with a range
overlap in one GIST index). This makes double-booking *impossible* at the
database level regardless of application-layer races — two concurrent
inserts for overlapping ranges will have one succeed and one fail with a
constraint violation, which the handler maps to a clear "that slot was
just taken" response. This is strictly stronger than a pre-insert
`SELECT` check and costs nothing extra to maintain.

**2. Buffers are baked into `busy_starts_at`/`busy_ends_at` at booking-creation
time**, computed from the event type's `buffer_before_minutes`/
`buffer_after_minutes` in application code and stored on the booking row
itself (`starts_at`/`ends_at` remain the actual, buffer-free meeting time
shown to the attendee). The `EXCLUDE` constraint operates on the
buffer-inclusive columns. This was necessary because Postgres exclusion
constraints can't reference another table's columns — denormalizing the
effective busy range onto the booking row is what makes the DB-level
constraint possible at all.

**Scope limit, stated plainly**: conflict detection in this slice is
**per event type**, not per host across all of a host's event types. A
host with two different event types could, today, get double-booked
across them at the same instant. True host-wide busy-time aggregation
(brief's "existing booking conflict detection" read maximally) is
follow-up work — flagged in `docs/roadmap/00-MASTER-PLAN.md`, not silently
assumed to be covered by this slice.

**3. The availability engine (`apps/api/internal/availability`) is pure
Go, timezone-aware via `time.LoadLocation` + `time.Date(..., loc)`** —
never by adding a fixed `time.Duration` to a UTC instant, which is exactly
the mistake that silently breaks across DST transitions (a "9am-5pm" rule
computed as "UTC instant + 8 hours" would compute the wrong wall-clock
time the day the UTC offset changes). `time.Date` resolves the correct
UTC offset for the *specific calendar date* being evaluated, which is
what makes DST handled correctly by construction rather than by luck.
This is verified by `availability_test.go` with tests that specifically
straddle a real DST transition (America/New_York, 2026-03-08 spring
forward and 2026-11-01 fall back), not just tests on DST-stable dates.

Because Alpine's `alpine:3.20` base image (this repo's `apps/api/Dockerfile`)
does not install the `tzdata` package, `time.LoadLocation` for any
non-UTC/non-Local zone would fail at runtime in production despite working
fine in local dev (most dev machines have system tzdata already). Fixed by
blank-importing `time/tzdata` in `cmd/server/main.go`, which embeds the
IANA database into the binary itself — this was caught and fixed here,
before shipping, rather than discovered later as a production-only bug.

## Consequences

- Every future write path that creates or moves a booking (create,
  reschedule) must compute and set `busy_starts_at`/`busy_ends_at`
  correctly from the event type's *current* buffer settings — if a
  buffer field is ever added to be editable per-booking instead of
  inherited from the event type, this computation moves with it.
- The `EXCLUDE` constraint means a booking INSERT can fail with a
  Postgres exclusion-violation error under legitimate concurrent-request
  contention (not just bugs) — every booking-creation code path must
  handle that specific error class and turn it into a real "slot no
  longer available, pick another" response, not a generic 500.
- `time/tzdata`'s blank import adds ~450KB to the compiled binary. That's
  the accepted cost of not depending on the deployment environment having
  the OS `tzdata` package installed — do not remove it as a "binary size
  optimization" without re-adding `apk add tzdata` to the Dockerfile *and*
  verifying it in a real Alpine container, not just local dev.
- Host-wide (cross-event-type) conflict detection, team/round-robin
  scheduling, and external calendar sync (Google/Outlook busy-time
  import) are all explicitly out of scope for this slice — see the
  master plan for what's actually built vs. still open.
