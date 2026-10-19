# Submify MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude Code, Codex, Cursor or any MCP client manage a self-hosted Submify instance: projects, submissions, exports and calendar bookings. It is a thin client over the existing REST API (`docs/api.md`), so it needs no backend changes and respects the same organization scoping and rate limits.

## Setup

```bash
cd apps/mcp
npm install && npm run build
```

| Env var | Required | Meaning |
|---|---|---|
| `SUBMIFY_URL` | no | Instance origin, default `http://localhost:2512` |
| `SUBMIFY_EMAIL` | yes | Login email of the account the agent acts as |
| `SUBMIFY_PASSWORD` | yes | That account's password |

The server logs in on first use and refreshes tokens automatically. Use a dedicated `member`-role account if you want to limit what the agent can touch (invite one from the dashboard).

### Claude Code

```bash
claude mcp add submify \
  -e SUBMIFY_URL=https://forms.example.com:2512 \
  -e SUBMIFY_EMAIL=you@example.com \
  -e SUBMIFY_PASSWORD='...' \
  -- node /absolute/path/to/Submify/apps/mcp/dist/index.js
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.submify]
command = "node"
args = ["/absolute/path/to/Submify/apps/mcp/dist/index.js"]
env = { SUBMIFY_URL = "https://forms.example.com:2512", SUBMIFY_EMAIL = "you@example.com", SUBMIFY_PASSWORD = "..." }
```

## Tools

| Tool | Does |
|---|---|
| `submify_health` | Instance + DB liveness |
| `submify_list_projects` | Projects with public keys and settings (secrets redacted) |
| `submify_create_project` | New project (returns the one-time portal password) |
| `submify_update_project` | Rename, allowed origins, email notification toggle/recipients |
| `submify_regenerate_project_keys` | Rotate a project's key pair — **old keys die immediately** |
| `submify_delete_project` | Delete a project and all its submissions — **irreversible** |
| `submify_list_submissions` | Paginated inbox |
| `submify_delete_submissions` | Delete submissions by id |
| `submify_export_submissions` | Save XLSX/PDF to a local path |
| `submify_submit_form` | Post a test submission via `/api/submit` |
| `submify_list_event_types` / `submify_list_bookings` / `submify_cancel_booking` | Calendar |

Destructive tools are flagged with the MCP `destructiveHint`, so clients prompt before running them. Credentials (SMTP, S3, Telegram, project secret keys) are never returned to the model. Backup/restore, self-update, password and user-management endpoints are deliberately not exposed.
