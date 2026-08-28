-- Adds real per-project calendar isolation. Until now event_types/bookings/
-- personal_events were organization-wide (see docs/decisions/0005 and the
-- "Consequences" section of docs/decisions/0010-portal-calendar-read-only.md,
-- which flagged this exact schema change as the prerequisite for real
-- per-project calendar isolation). See
-- docs/decisions/0011-project-scoped-calendar.md for the full reasoning.
--
-- Columns are added nullable, backfilled to each organization's default
-- project (falling back to the earliest-created project for an org with no
-- flagged default, which should never happen per ADR 0002 but is handled
-- defensively rather than left to violate NOT NULL), then made NOT NULL —
-- no existing calendar data is dropped or reassigned to the wrong org.

ALTER TABLE event_types ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE personal_events ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

UPDATE event_types et SET project_id = (
  SELECT id FROM projects p WHERE p.organization_id = et.organization_id ORDER BY p.is_default DESC, p.created_at ASC LIMIT 1
) WHERE et.project_id IS NULL;

UPDATE bookings b SET project_id = (
  SELECT et.project_id FROM event_types et WHERE et.id = b.event_type_id
) WHERE b.project_id IS NULL;

UPDATE personal_events pe SET project_id = (
  SELECT id FROM projects p WHERE p.organization_id = pe.organization_id ORDER BY p.is_default DESC, p.created_at ASC LIMIT 1
) WHERE pe.project_id IS NULL;

ALTER TABLE event_types ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE personal_events ALTER COLUMN project_id SET NOT NULL;

-- The slug uniqueness boundary moves from the organization to the project:
-- each project now has its own independent calendar, so two different
-- projects in the same organization must be free to both use a common slug
-- like "consultation" — confirmed live during this migration's own testing,
-- where creating a second project's event type with the same slug the
-- default project already used failed with a duplicate-key error under the
-- old organization-wide constraint.
ALTER TABLE event_types DROP CONSTRAINT IF EXISTS event_types_organization_id_slug_key;
ALTER TABLE event_types ADD CONSTRAINT event_types_project_id_slug_key UNIQUE (project_id, slug);

CREATE INDEX IF NOT EXISTS idx_event_types_project_id ON event_types(project_id);
CREATE INDEX IF NOT EXISTS idx_bookings_project_id ON bookings(project_id);
CREATE INDEX IF NOT EXISTS idx_personal_events_project_id ON personal_events(project_id);
