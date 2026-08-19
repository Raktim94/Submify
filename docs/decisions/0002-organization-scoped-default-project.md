# 0002: Projects (and their "default/inbox" flag) are scoped to the organization, not the creating user

Date: 2026-08-19

## Context

ADR [0001](0001-workspaces-layer-approach.md) established that an
organization's existing members share access to the organization's
projects — that's the whole point of introducing organizations instead of
leaving each user siloed. Enforcing that in code means every project-scoping
query (`ProjectOwnedBy`, `ListProjects`, `UpdateProject*`, `DeleteProject`,
upload/export/submission handlers, …) needed to move from filtering by
`user_id` to filtering by `organization_id`.

That surfaced a real data conflict: before this change, every new account —
including a non-admin account an admin added via `CreateUserByAdmin` — got
its own private `is_default = TRUE` "Default" project
(`store.go:createUser`, unconditional). Once those users are grouped into
one organization by 0009's bootstrap, an organization can end up with
*several* projects flagged `is_default = TRUE` simultaneously. A per-
organization "the default project" concept needs exactly one, so this had
to be resolved before a `UNIQUE (organization_id) WHERE is_default` index
could even be added.

## Decision

1. `is_default` becomes a per-organization concept: at most one default
   project per organization, enforced by
   `idx_projects_one_default_per_organization`
   (`apps/api/internal/db/migrations/0010_organization_scoped_projects.sql`),
   replacing the old `idx_projects_one_default_per_user`.
2. Migration 0010 resolves existing conflicts by keeping the
   **earliest-created** `is_default` project per organization and clearing
   the flag on any others — no project is deleted or reassigned, only the
   flag changes. This mirrors 0009's "earliest wins" bootstrap rule for
   consistency.
3. Going forward, `CreateUserByAdmin` (an admin inviting a teammate into
   their existing organization) **no longer creates a project at all** —
   the invited member simply gets access to the organization's existing
   projects. Only `RegisterUser` (the account that creates a brand-new
   organization) provisions that organization's initial "Default" project.

## Consequences

- All project-scoping store methods now take an `organization_id`, not a
  `user_id` — see the corresponding `apps/api/internal/db/store.go` changes
  in this same commit. `projects.user_id` still exists and is still
  written on create, but it now means "who created this project," not "who
  may access this project." Do not use it for authorization.
- An admin-invited teammate on an existing install will, the moment this
  migration runs, gain visibility into every project their organization
  already owns (previously they'd have seen only their own empty default
  project). This is the intended effect of ADR 0001, not a bug — but it is
  a real, immediate access-level change for any install that already has
  more than one user. Operators upgrading a multi-user install should be
  aware of this before deploying the upgrade.
- `RemoveOrganizationMember`/`DeleteUserInOrganization` must never allow
  deleting an organization's `owner` role — see
  `store.DeleteUserInOrganization`. An organization with zero owners is an
  invariant violation with no defined recovery path yet (ownership
  transfer is not built).
