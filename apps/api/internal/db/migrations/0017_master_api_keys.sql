-- Master API keys: long-lived bearer credentials for AI agents and scripts
-- (Claude Code, Codex, CI). A key acts as the user who created it, inside
-- that user's organization, with exactly that user's permissions. Only a
-- SHA-256 hash of the key is stored; the plaintext is shown once at creation.
-- Deliberately not in the backup allowlist (same as refresh_sessions): keys
-- are credentials, re-issue them after a restore. See
-- docs/decisions/0012-master-api-keys-and-remote-mcp.md.
CREATE TABLE IF NOT EXISTS master_api_keys (
    id              UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    key_prefix      TEXT NOT NULL,
    key_hash        TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_master_api_keys_org ON master_api_keys(organization_id);
