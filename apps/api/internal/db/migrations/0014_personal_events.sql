-- See docs/decisions/0008-personal-calendar-events.md for the reasoning:
-- this is deliberately separate from event_types/bookings (which model
-- external/attendee scheduling) — personal_events is a user's own private
-- agenda (a task, a note, a reminder), scoped to organization_id for
-- tenant isolation AND to user_id for privacy (never shared org-wide).

CREATE TABLE IF NOT EXISTS personal_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'event' CHECK (kind IN ('event', 'task', 'reminder')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  color TEXT NOT NULL DEFAULT 'indigo',
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  remind_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_personal_events_user_starts_at ON personal_events(user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_personal_events_organization_id ON personal_events(organization_id);

-- Partial index scoped to exactly what the reminder-dispatch job scans
-- every tick — keeps that query cheap even as the table grows, since most
-- rows have no pending reminder.
CREATE INDEX IF NOT EXISTS idx_personal_events_due_reminders ON personal_events(remind_at)
  WHERE remind_at IS NOT NULL AND reminder_sent_at IS NULL;
