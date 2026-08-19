# Architecture decisions

Short, dated records of *non-obvious* decisions — the kind where the reasoning
isn't recoverable just by reading the resulting code, so it would otherwise
get re-litigated or silently reverted by a future change.

## When to write one

Write one when a decision meets at least one of these:

- It looks wrong or arbitrary out of context (e.g. "why is this hardcoded
  instead of an env var") and someone could plausibly "fix" it back into a
  bug.
- It came from a real production incident, not a hypothetical.
- It trades off two reasonable options and picked the non-default one for a
  specific reason.

Don't write one for:

- Routine implementation choices with an obvious rationale (naming, standard
  library usage, following an existing pattern already established elsewhere
  in the repo).
- Anything a code comment at the call site already explains adequately in
  1-2 lines.

If unsure, the test is: "would a competent engineer new to this repo make
the opposite choice and be wrong?" If yes, write it down. If they'd just
shrug and move on either way, don't.

## Format

`NNNN-short-slug.md`, sequential numbering, one decision per file:

```markdown
# NNNN: Title (imperative, states the decision)

Date: YYYY-MM-DD

## Context

What problem/incident/trade-off forced this decision. Cite the real failure
mode if there was one (error message, symptom) — that's what makes it
findable later.

## Decision

What was actually decided/done.

## Consequences

What this trades away or constrains going forward. If a future change could
plausibly undo this by accident, say what breaks and how to notice.
```

Keep call-site comments short — a one-line pointer (`# See docs/decisions/0002-*.md`)
is enough; the full reasoning lives here, not duplicated at every call site.

## Index

| # | Title |
|---|---|
| [0001](./0001-workspaces-layer-approach.md) | Add an Organizations/Workspaces layer as a bootstrap-compatible wrapper, not a per-user split |
| [0002](./0002-organization-scoped-default-project.md) | Projects (and their "default/inbox" flag) are scoped to the organization, not the creating user |
| [0003](./0003-local-storage-fallback.md) | Local disk is the automatic upload fallback when no S3 is configured — not a separate opt-in mode |
| [0004](./0004-backup-format-pure-go-json-dump.md) | Backups are a pure-Go JSON table dump, not a shelled-out `pg_dump` |
| [0005](./0005-calendar-booking-architecture.md) | Calendar/booking core — buffer-inclusive ranges for conflict detection, DB-level exclusion constraint, pure-Go availability engine |
| [0006](./0006-zulivio-integration-via-existing-api-key.md) | Zulivio integration pushes leads via Zulivio's existing personal API key — no new Zulivio-side infrastructure |

See `../roadmap/00-MASTER-PLAN.md` for the full program plan and status.
