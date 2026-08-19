-- See docs/decisions/0002-organization-scoped-default-project.md.
-- Projects are now shared within an organization, so "the default/inbox
-- project" must be unique per organization, not per user.

-- Before adding the new constraint: some installs may have more than one
-- is_default=TRUE project per organization today (0009 grouped existing
-- users into one org, but each of those users previously had their own
-- personal default project). Keep the earliest-created one per
-- organization as canonical, un-default the rest — nothing is deleted,
-- only the is_default flag changes.
WITH ranked AS (
  SELECT id, organization_id,
         ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at ASC) AS rn
  FROM projects
  WHERE is_default = TRUE
)
UPDATE projects SET is_default = FALSE
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DROP INDEX IF EXISTS idx_projects_one_default_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_default_per_organization ON projects(organization_id) WHERE is_default;
