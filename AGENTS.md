# AGENTS.md — Submify

Two audiences. Pick yours.

## Integrating Submify into someone's website

Read [`prompts/AI_INTEGRATION_PROMPT.md`](prompts/AI_INTEGRATION_PROMPT.md). Key facts:

- Public endpoint is `POST /api/submit` (not `/api/v1`), header `x-api-key: pk_live_…`, success is `201`.
- The public key is safe in client code. The project **secret** key, account password and SMTP/S3/Telegram credentials never go in a website or in your output.
- Submify is self-hosted: ask for the instance URL; do not invent one.
- API contract: [`docs/api.md`](docs/api.md). MCP server (owner tooling, stdio): [`apps/mcp/README.md`](apps/mcp/README.md).

## Working on this repository

Read `CLAUDE.md` and `docs/roadmap/00-MASTER-PLAN.md` first. API changes must update both `docs/api.md` and `apps/web/content/api.md`. Add migrations only under `apps/api/internal/db/migrations/`. Never add a Co-Authored-By trailer.
