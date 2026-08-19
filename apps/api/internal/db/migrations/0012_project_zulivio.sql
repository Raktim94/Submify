-- See docs/decisions/0006-zulivio-integration-via-existing-api-key.md.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS zulivio_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS zulivio_api_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS zulivio_api_key TEXT;
