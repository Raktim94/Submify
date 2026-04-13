-- Project public/secret keys (pk_live_ / sk_live_), optional origin whitelist; submission client metadata.

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS client_ip TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS api_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS api_secret TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS allowed_origins TEXT;

UPDATE projects SET
  api_key = 'pk_live_' || replace(public_api_key::text, '-', ''),
  api_secret = 'sk_live_' || encode(gen_random_bytes(32), 'hex')
WHERE api_key IS NULL;

ALTER TABLE projects ALTER COLUMN api_key SET NOT NULL;
ALTER TABLE projects ALTER COLUMN api_secret SET NOT NULL;

DROP INDEX IF EXISTS idx_projects_public_api_key;
ALTER TABLE projects DROP COLUMN IF EXISTS public_api_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_api_key ON projects(api_key);
