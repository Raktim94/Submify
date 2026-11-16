# 0012: Master API keys act as their creator, and the remote MCP endpoint dispatches through the real routes

Date: 2026-11-16

## Context

The user wanted an AI agent such as Claude Code to run a Submify instance
end to end: create projects, issue website keys, wire forms into a site and
deploy them, and manage the rest of the account. The existing MCP server
(`apps/mcp`, stdio) logged in with an account email and password stored in
the agent's config. That is a reusable full-account credential that cannot
be scoped, listed or revoked without changing the password, and it needs a
local Node install on every agent machine.

## Decision

1. **Master API keys** (`smk_` + 32 random bytes, migration `0017`). Only a
   SHA-256 hash is stored (the key has 256 bits of entropy, so a slow KDF
   adds nothing). A key authenticates in `AuthGuard` as **the user who
   created it, in that user's organization, with exactly that user's
   permissions**. No separate permission model was invented: Submify's
   roles are still mostly "member of the organization" plus the
   instance-wide `is_admin` flag, and a second parallel model would drift.
   A key stops working when it is revoked, expires, its user is deleted, or
   its user stops being a member of the key's organization (checked on
   every request by a join, not cached).
2. **Dashboard-only actions.** Anything that creates or replaces a login
   credential, or hands out the whole database, refuses key authentication
   (`InteractiveSessionOnly`): key mint/revoke, password change,
   `POST /users`, backup download, restore-over-active, backup S3 config and
   S3 restore. (The first cut guarded only the first three; the audit showed
   an admin's key could create a lasting admin account or rewrite the
   owner's password through a crafted restore, so the guard now covers every
   credential-creating route.) A leaked
   key therefore cannot mint a replacement for itself or lock the owner out,
   and the owner can always revoke it from the dashboard. Keys are only read
   from the `Authorization` header, never from a cookie.
3. **Visibility.** Admins see and revoke every key in the organization;
   other members see and revoke only their own. Max 25 active keys per
   organization.
4. **Remote MCP endpoint** at `POST /api/v1/mcp` (Streamable HTTP,
   stateless, JSON responses, no SSE). Each tool call is executed by
   building an internal `http.Request` with the caller's `Authorization`
   header and running it through the same Gin engine (`s.engine.ServeHTTP`).
   This is the important part: the MCP layer has **no privileges or
   business rules of its own**. Organization scoping, admin checks,
   validation, rate limits and the dashboard-only guard all apply exactly as
   they do for the dashboard. A tool can never do something the key could
   not do over REST.
5. **IDs are validated as UUIDs before they are put into an internal path.**
   Go decodes the URL path before routing, so escaping alone would not stop
   `../system/update/apply` from reaching another route.
6. The endpoint requires an `Authorization` header even though `AuthGuard`
   also accepts the session cookie, so a browser page on another origin
   cannot drive it with the owner's cookies.
7. `apps/mcp` keeps working for clients that only speak stdio: with
   `SUBMIFY_API_KEY` set it becomes a thin stdio-to-HTTP bridge to the
   remote endpoint, so its tools always match the server version. The old
   email/password mode stays for instances older than 0.5.0.

## Consequences

- The MCP catalogue offers S3 backup, update check and apply (destructive-
  flagged) but no restore, user creation or local backup download.
- Also fixed by the audit: password change now signs out every other
  session, portal sessions end when the portal password changes, refresh
  tokens with no session row are rejected (restore used to revive logged-out
  tokens), first-run registration is atomic, and removing a teammate moves
  their projects to the owner instead of deleting them.
- Keys are not in the backup allowlist (same reasoning as
  `refresh_sessions`): re-issue keys after a restore.
- Project secrets (`sk_live_`) are redacted from MCP list/update output and
  are only returned by the explicit `submify_get_project_keys` tool, to
  reduce what a prompt-injected agent can leak by accident.
- When real role-based permissions land (master plan, Phase 2 follow-up),
  keys inherit them automatically because they resolve to a user.
