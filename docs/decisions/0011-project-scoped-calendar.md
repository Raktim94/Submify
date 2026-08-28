# 0011: Calendar (event types, bookings, personal agenda) becomes project-scoped, not organization-wide

Date: 2026-08-28

## Context

Since ADR 0005/0008, `event_types`/`bookings`/`personal_events` were scoped
only by `organization_id`. ADR 0010 (client portal calendar) explicitly
flagged the consequence: a project's portal password grants visibility into
the *entire organization's* bookings, not just that project's, because
there was no `project_id` column to filter on — and named the fix as "add a
`project_id` on `event_types`/`bookings`," deliberately deferred at the
time as out of scope for that slice.

The user asked directly for that fix now: every project should have its
own calendar, distinct from every other project's, selectable from a
dropdown on the dashboard `/calendar` tab (matching the existing
project-picker pattern already used on `/export`), and the client portal
should show only that one project's calendar — not the whole
organization's.

## Decision

Add `project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
to `event_types`, `bookings`, and `personal_events` (migration `0015`).
Backfilled to each organization's default project (`is_default=TRUE`,
falling back to the earliest-created project for an org with none flagged
— defensive, shouldn't trigger given ADR 0002's invariant) so no existing
calendar data is lost or silently reassigned to the wrong organization.

**`bookings.project_id` is denormalized from its event type at creation
time** (`et.ProjectID`, not a value the client supplies), matching this
codebase's existing pattern of denormalizing `organization_id` onto
`bookings` rather than always joining through `event_types`.

**Dashboard scoping**: `ListEventTypes`, `ListBookingsForOrganization`, and
`ListPersonalEvents` now take a required `projectID` alongside `orgID`.
`CreateEventType` and `CreatePersonalEvent` require a `project_id` in the
request body, validated with a new `resolveProjectID` helper
(`httpapi/calendar.go`) that calls the existing `store.ProjectOwnedBy`
before trusting a client-supplied project id — the same IDOR boundary
every other project-scoped endpoint already uses (`/projects/:id/*`).

**Deliberately NOT project-scoped further**: `GetEventType`,
`DeleteEventType`, `UpsertEventTypeOverride`, `UpdatePersonalEvent`,
`DeletePersonalEvent`, and `CancelOrgBooking` still authorize by
organization only, keyed on the specific record's own id. These operate on
a single record the caller already knows the id of (clicked from a list
that was itself already project-filtered) — re-validating against a
*currently selected* project on top of that would only reject legitimate
requests if the UI's selected-project dropdown and the record's actual
project ever momentarily disagree, for no real security benefit (org-level
ownership is already enforced). Moving a personal item or event type
between projects after creation is not a feature this slice adds.

**`CancelOrgBooking` no longer scans the organization's next-10-years of
bookings to confirm ownership** — replaced with a direct
`BookingOwnedBy(orgID, id)` lookup (new store method), which was already
possible before this change and is unrelated to project scoping; fixed
in passing since the function was being touched anyway.

**Portal**: `PortalEventTypes`/`PortalBookings` (`httpapi/portal_calendar.go`)
now read `portal_project_id` (already resolved by `PortalGuard`, previously
set but unused by these two handlers) instead of only
`portal_organization_id`, and pass both into the now project-scoped store
methods. This directly closes the gap ADR 0010 flagged: a portal visitor
now sees only their own project's event types and bookings. No frontend
change was needed on the portal side — `app/[slug]/page.tsx` already calls
`portalEventTypes()`/`portalBookings()` with no project parameter (the
portal session is inherently single-project), so the fix is entirely
backend-side.

**Frontend**: `/calendar` gained a project `<Select>` (mirroring
`/export`'s `Project`/`Select` pattern) shared across both the Calendar
grid and Event Types tabs, defaulting to the org's default project (index
0 of `GET /projects`, which is already sorted `is_default DESC,
created_at DESC`) and persisted in the URL as `?project=<id>` alongside
the existing `tab`/`view`/`date` params. Switching projects refetches
event types, bookings, and personal items scoped to the newly selected
project; "New event type" and "New calendar item" both create records
under the currently selected project.

## Consequences

- A project deleted via `DeleteProject` now cascades its event types,
  bookings, and personal events too (`ON DELETE CASCADE` on the new
  `project_id` FK) — previously these rows were only cleaned up by
  `organization_id` cascade at the organization level, so a project delete
  left its calendar data orphaned-but-still-organization-visible. This is
  a behavior change worth knowing before deleting a project that has
  active bookings: cancel or reassign its event types first if the
  bookings need to be preserved elsewhere.
- `docs/api.md` and `apps/web/content/api.md`'s Calendar & Booking and
  Client portal sections are updated: `project_id` is now a required field
  on `POST /event-types` and `POST /calendar/items`, and a required query
  param on `GET /event-types`, `GET /bookings`, `GET /calendar/items`. The
  "Connecting calendar booking to your website" integration guide is
  updated to mention selecting the right project first.
- Anyone integrating directly against the old (organization-wide) API
  contract for these three endpoints needs to add `project_id` — this is a
  breaking API change for those three list/create endpoints, not merely
  additive. Flagged here rather than silently shipped: no external
  integrators are known to exist yet for this self-hosted, pre-1.0
  product, so this was accepted rather than versioning the API.
