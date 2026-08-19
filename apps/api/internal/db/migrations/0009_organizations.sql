-- See docs/decisions/0001-workspaces-layer-approach.md for why this wraps
-- each existing installation in exactly one organization instead of
-- splitting per user.

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Bootstrap: wrap an existing installation's data into exactly one
-- organization so upgrading never reassigns or loses access. No-op on a
-- brand-new install (no users yet) — first registration creates its own
-- organization at the application layer instead (follow-up work, not this
-- migration).
DO $$
DECLARE
  bootstrap_org_id UUID;
  earliest_user_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM users) AND NOT EXISTS (SELECT 1 FROM organizations) THEN
    bootstrap_org_id := gen_random_uuid();
    INSERT INTO organizations (id, name) VALUES (bootstrap_org_id, 'My Organization');

    INSERT INTO organization_members (organization_id, user_id, role)
    SELECT bootstrap_org_id, id, CASE WHEN is_admin THEN 'admin' ELSE 'member' END
    FROM users;

    SELECT id INTO earliest_user_id FROM users ORDER BY created_at ASC LIMIT 1;
    UPDATE organization_members
    SET role = 'owner'
    WHERE organization_id = bootstrap_org_id AND user_id = earliest_user_id;

    UPDATE projects SET organization_id = bootstrap_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

ALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id);
