-- See docs/decisions/0005-calendar-booking-architecture.md for the
-- reasoning behind the EXCLUDE constraint and the buffer-inclusive
-- busy_starts_at/busy_ends_at columns.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS event_types (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  location TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL,
  buffer_before_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  min_notice_minutes INT NOT NULL DEFAULT 60 CHECK (min_notice_minutes >= 0),
  max_advance_days INT NOT NULL DEFAULT 60 CHECK (max_advance_days > 0),
  slot_interval_minutes INT NOT NULL DEFAULT 15 CHECK (slot_interval_minutes > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_event_types_organization_id ON event_types(organization_id);

CREATE TABLE IF NOT EXISTS availability_rules (
  id UUID PRIMARY KEY,
  event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  weekday INT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday .. 6=Saturday
  start_minute INT NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INT NOT NULL CHECK (end_minute > 0 AND end_minute <= 1440),
  CHECK (end_minute > start_minute)
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_event_type_id ON availability_rules(event_type_id);

CREATE TABLE IF NOT EXISTS availability_overrides (
  id UUID PRIMARY KEY,
  event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT TRUE,
  start_minute INT CHECK (start_minute IS NULL OR (start_minute >= 0 AND start_minute < 1440)),
  end_minute INT CHECK (end_minute IS NULL OR (end_minute > 0 AND end_minute <= 1440)),
  UNIQUE (event_type_id, override_date)
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  -- Buffer-padded range used only for conflict detection — see the ADR.
  busy_starts_at TIMESTAMPTZ NOT NULL,
  busy_ends_at TIMESTAMPTZ NOT NULL,
  attendee_name TEXT NOT NULL,
  attendee_email TEXT NOT NULL,
  attendee_timezone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  manage_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  CHECK (ends_at > starts_at),
  CHECK (busy_ends_at > busy_starts_at),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    event_type_id WITH =,
    tstzrange(busy_starts_at, busy_ends_at) WITH &&
  ) WHERE (status = 'confirmed')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_manage_token ON bookings(manage_token);
CREATE INDEX IF NOT EXISTS idx_bookings_organization_id ON bookings(organization_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_type_starts_at ON bookings(event_type_id, starts_at);
