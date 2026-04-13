-- Per-account form API key (embed on websites). Tenant isolation stays in app + FKs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key TEXT;
UPDATE users SET api_key = gen_random_uuid()::text WHERE api_key IS NULL;
ALTER TABLE users ALTER COLUMN api_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

-- Exactly one default inbox project per user (receives POST /submit when using user api_key).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_default_per_user
  ON projects(user_id)
  WHERE is_default;

-- Backfill: one default inbox per user (oldest project) if none marked yet.
UPDATE projects p
SET is_default = TRUE
FROM (
  SELECT DISTINCT ON (user_id) id
  FROM projects
  ORDER BY user_id, created_at ASC
) pick
WHERE p.id = pick.id AND NOT EXISTS (SELECT 1 FROM projects x WHERE x.user_id = p.user_id AND x.is_default = TRUE);
