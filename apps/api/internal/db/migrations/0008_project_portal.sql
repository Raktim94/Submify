-- Per-project client portal: a public URL slug (served at /<slug>) plus an optional
-- password that lets a project's client sign in and ONLY view/export that project's
-- submissions. The account owner still manages everything from the dashboard.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_slug TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_password_hash TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Backfill a slug for existing projects from their name (deduped, unique). The portal
-- stays inactive until the owner generates a password from the dashboard, because
-- argon2 hashing happens in the app, never in SQL.
WITH base AS (
  SELECT
    id,
    created_at,
    COALESCE(
      NULLIF(trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')), ''),
      'project'
    ) AS b
  FROM projects
  WHERE portal_slug IS NULL
),
slugged AS (
  SELECT
    id,
    b,
    row_number() OVER (PARTITION BY b ORDER BY created_at ASC, id ASC) AS rn
  FROM base
)
UPDATE projects p
SET portal_slug = CASE
  WHEN s.rn = 1 THEN s.b
  ELSE s.b || '-' || left(replace(p.id::text, '-', ''), 6)
END
FROM slugged s
WHERE p.id = s.id;

-- One portal slug per instance (case-insensitive), so /<slug> resolves to a single project.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_portal_slug
  ON projects (lower(portal_slug))
  WHERE portal_slug IS NOT NULL;
