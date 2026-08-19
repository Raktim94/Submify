# 0001: Add an Organizations/Workspaces layer as a bootstrap-compatible wrapper, not a per-user split

Date: 2026-08-19

## Context

The platform-upgrade program (`docs/roadmap/00-MASTER-PLAN.md`) requires
real tenant isolation, role-based access (Owner/Administrator/Manager/
Member/Viewer), and an audit trail — none of which fit today's schema.
Discovery (`docs/roadmap/01-DISCOVERY.md`) found Submify is currently
single-tenant per instance: `users` has a boolean `is_admin`, `projects`
hangs off `user_id` directly, and registration is gated shut after the
first account (`docs/api.md`), with the admin able to add further
non-admin accounts by hand afterward.

The open question: when introducing an `organizations` concept, does each
existing user become the sole owner of their *own* new organization (a
literal per-user split), or does the whole existing installation become
*one* organization that all its existing users share?

This matters because it's irreversible-by-accident: guessing wrong silently
reassigns who can see which projects/submissions the moment this migration
runs, on every existing self-hosted install upgrading in place — exactly
the kind of accidental-data-loss migration §59 (upgrade safety) and §76
(destructive actions) of the master brief exist to prevent.

## Decision

One organization per **existing installation**, not one per existing user.

The bootstrap migration (`apps/api/internal/db/migrations/0009_organizations.sql`)
creates exactly one `organizations` row per install that already has at
least one user, adds every existing user to it via `organization_members`
(role mapped from their current `is_admin`: `true` → `admin`, `false` →
`member`), then promotes the single earliest-created user (the same one
`0007_user_admin.sql` already flagged `is_admin = TRUE`) to `owner`. Every
existing `projects` row gets `organization_id` set to that one bootstrap
org, then the column is made `NOT NULL`.

Reasoning: the *existing* "admin adds more non-admin accounts by hand"
pattern only makes sense if those accounts were meant to collaborate on the
same shared set of projects — that's a workspace with roles, not several
independent tenants that happen to share a Postgres instance. Splitting
each user into their own organization would silently sever a team's
shared access to their own existing projects on upgrade, which is a much
worse failure mode than temporarily under-modeling true multi-org support
(an install can still contain more than one organization going forward —
new users just aren't auto-assigned to a second one on this migration).

Registration-gating behavior changes from "closes after the first
*account* ever" to "closes after the first *organization* exists" in a
follow-up application-layer change (not this migration) — new members join
an existing org via an invite flow with an explicit role, replacing the
current admin-only bare `CreateUser` endpoint. That app-layer change is
still open work, tracked in Phase 2/3 of the master plan, not done by this
migration alone.

## Consequences

- Every table that needs tenant scoping going forward (calendar event
  types, bookings, API keys, audit logs, webhooks, backups) should hang off
  `organization_id` directly, not off `projects.user_id` — `projects` keeps
  `user_id` only to record *who created* a project, not for authorization.
- A future engineer must not "simplify" this by re-deriving
  `organization_id` from `user_id` anywhere in query logic — a user can
  belong to more than one organization once invites exist, so `user_id`
  alone is no longer sufficient to resolve tenant scope. Every
  organization-scoped query must take `organization_id` explicitly (from
  the authenticated session's active-org context, still to be designed).
- `organization_members.role` is currently a free `TEXT` column (`owner`,
  `admin`, `member` are the only values written by the migration) rather
  than a Postgres `ENUM`, matching this codebase's existing convention of
  plain `TEXT` + app-level validation (no `ENUM`/`CHECK` constraints appear
  anywhere in `apps/api/internal/db/migrations/*.sql` today) — app-side
  validation must enforce the full five-role set (`owner`, `admin`,
  `manager`, `member`, `viewer`) since the DB won't.
- This migration only adds schema + backfills data. It does **not** yet
  update `apps/api/internal/db/store.go` or any handler to actually
  authorize by `organization_id` — that's the next concrete slice of work,
  and until it lands, `organization_id` exists but isn't yet enforced
  anywhere. Do not consider tenant isolation (§41 of the master brief) done
  until that follow-up work is verified with real cross-tenant-access
  tests, not just "the column exists."
