# 0010: Client portal calendar is view-only — no booking create/reschedule/cancel, and organization-wide by necessity

Date: 2026-08-21

## Context

The client portal (`docs/decisions` predates this file for the portal
itself — see `apps/api/internal/httpapi/portal.go` and
`docs/api.md`'s "Client portal" section) was, until now, submissions-only:
"view and export that project's submissions — and nothing else." The
2026-08-21 master-plan session log entry ("Local Docker instance rebuilt…")
flagged a real gap: calendar/booking rows are keyed by `organization_id`
(`apps/api/internal/db/calendar.go`), not `project_id` — no such column
exists on `event_types` or `bookings` — so there was no way for a portal
visitor to see their organization's scheduled bookings at all, even though
an org-invited dashboard collaborator already can.

The request that prompted this ADR was explicit: "Clients should see their
calendar bookings and use full calendar features." That phrasing is
ambiguous between (a) a full real *viewing* experience (month/week/day
grid, not a flat list) while staying read-only, and (b) actual booking
management (reschedule/cancel) by the portal visitor.

## Decision

**(a), not (b).** The portal calendar is strictly read-only, matching the
portal's existing security posture (no delete rights on submissions
either). New endpoints, guarded by the existing `PortalGuard` middleware
(HttpOnly cookie session, `Cache-Control: no-store`, rate-limited):

- `GET /portal/event-types` — read-only, minimized `db.EventType` fields
  (title/description/duration/location/timezone/is_active). Strips
  `host_user_id` and scheduling-policy internals (buffers, min notice,
  slot interval, max advance days) a viewer has no use for.
- `GET /portal/bookings?from=&to=` — read-only, minimized `db.Booking`
  fields. Strips `manage_token` (a bearer credential — leaking it would
  let a portal visitor reschedule/cancel a real booking through the
  *existing* public booking-management endpoints, which is exactly the
  write access this ADR withholds) and strips `attendee_email`/`notes`
  (see "organization-wide, not project-wide" below).

No new routes for creating, rescheduling, or cancelling a booking, or for
deleting/editing an event type, were added to the portal group. The
existing dashboard endpoints (`POST /bookings/:id/cancel`, the `/public/*`
booking-management flow keyed by `manage_token`) are unchanged and are not
reachable from a portal session.

Frontend: the dashboard's calendar grid components (`MonthView`,
`TimeGridView`, `MiniCalendar`, `BookingDetailsDialog`,
`buildCalendarEntries`) were already decoupled from any dashboard-only
auth assumption — they take data as props, not fetch it themselves — so
they're reused as-is on `/[slug]`. The one real coupling was
`CalendarEntry.booking`/`BookingDetailsDialog`'s `booking` prop being typed
as the dashboard's full `Booking` (which has required `attendee_email`).
Generalized to a structural `BookingLike` type
(`components/calendar/entries.ts`) with `attendee_email`/`notes` optional,
satisfied by both the dashboard's `Booking` and the portal's minimized
`PortalBooking` — no duplicate dialog/grid components needed. The portal
page adds its own `/portal/event-types` + `/portal/bookings` client
(`lib/portal.ts`) and its own month/week/day navigation state, mirroring
`app/(app)/calendar/page.tsx`'s pattern but without URL search-param
persistence (the portal doesn't need deep-linkable calendar state).

## Organization-wide, not project-wide — a real, disclosed limitation

Because bookings/event types have no `project_id`, scoping the portal's
calendar query is necessarily by `organization_id` (resolved once in
`PortalGuard` from the portal session's project → `project.OrganizationID`
and stashed as `portal_organization_id`), not by the one project the
portal link nominally belongs to. **This means any project's portal
password grants visibility into that entire organization's bookings**
across all event types and all attendees — not just bookings related to
that specific project's client — because the data model has no finer
grain to scope to.

This is an inherent consequence of the existing schema (see ADR 0005),
not a new design choice, and matches how an org-invited dashboard
collaborator already sees the org's full calendar today. It is mitigated,
not eliminated, by stripping `attendee_email` and `notes` from the portal
response — a portal visitor sees *that* a slot is booked and *who by name*
(needed to render a meaningful calendar), but not the other attendee's
email address or whatever they wrote in the booking notes field. An
organization that wants stricter per-client calendar isolation would need
a schema change (a `project_id` on `event_types`/`bookings`) — explicitly
out of scope here per the "no new migrations" constraint on this slice.

## Explicitly excluded: personal events

`personal_events` (ADR 0008) — a user's own private agenda, editable,
visible only to its creator even within the same organization — is never
queried by either new portal handler. `PortalBookings` calls
`store.ListBookingsForOrganization`, which only reads the `bookings`
table; `PortalEventTypes` calls `store.ListEventTypes`, which only reads
`event_types`. Neither touches `personal_events` or calls
`ListPersonalEvents`. Verified live (see the master-plan session log entry
for this date): created a personal reminder as an org member, confirmed it
never appears in the portal calendar view.

## Consequences

- A future request for real per-project calendar isolation (rather than
  organization-wide) is a schema change (add `project_id` to
  `event_types`, backfill, update every calendar query), not a portal-side
  fix — don't try to bolt project filtering onto the existing handlers
  without that migration; there's no column to filter on.
- If a future change adds portal-side booking management (the "(b)"
  option explicitly declined here), it must go through the *existing*
  `manage_token`-based `/public/bookings/:token/*` flow's trust model
  (the token, not portal-session identity, is what would need to be
  surfaced) or a new explicit write-scoped portal permission — don't
  silently add `PortalCancelBooking` etc. under the current
  read-only `PortalGuard` group without re-litigating this decision.
- `BookingLike` in `components/calendar/entries.ts` is now the shared
  contract between dashboard and portal booking rendering — a future
  field added to the dashboard's `Booking` type that the grid/dialog
  needs to render must be added to `BookingLike` (optional, if the portal
  won't send it) rather than reintroducing a dashboard-only `Booking` prop
  type on these shared components.
