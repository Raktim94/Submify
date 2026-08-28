package db

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/nodedr/submify/apps/api/internal/keys"
)

// ErrSlotConflict is returned by CreateBooking/RescheduleBooking when the
// requested range collides with an existing confirmed booking — mapped
// from Postgres exclusion-constraint violation (SQLSTATE 23P01). See
// docs/decisions/0005-calendar-booking-architecture.md.
var ErrSlotConflict = errors.New("that time is no longer available")

const exclusionViolationSQLState = "23P01"

func isExclusionViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), exclusionViolationSQLState)
}

type EventType struct {
	ID                  string    `json:"id"`
	OrganizationID      string    `json:"organization_id"`
	ProjectID           string    `json:"project_id"`
	HostUserID          string    `json:"host_user_id"`
	Slug                string    `json:"slug"`
	Title               string    `json:"title"`
	Description         string    `json:"description"`
	DurationMinutes     int       `json:"duration_minutes"`
	Location            string    `json:"location"`
	Timezone            string    `json:"timezone"`
	BufferBeforeMinutes int       `json:"buffer_before_minutes"`
	BufferAfterMinutes  int       `json:"buffer_after_minutes"`
	MinNoticeMinutes    int       `json:"min_notice_minutes"`
	MaxAdvanceDays      int       `json:"max_advance_days"`
	SlotIntervalMinutes int       `json:"slot_interval_minutes"`
	IsActive            bool      `json:"is_active"`
	CreatedAt           time.Time `json:"created_at"`
}

const eventTypeSelect = `id, organization_id, project_id, host_user_id, slug, title, description, duration_minutes, location, timezone, buffer_before_minutes, buffer_after_minutes, min_notice_minutes, max_advance_days, slot_interval_minutes, is_active, created_at`

func scanEventType(row interface{ Scan(...any) error }) (EventType, error) {
	var e EventType
	err := row.Scan(&e.ID, &e.OrganizationID, &e.ProjectID, &e.HostUserID, &e.Slug, &e.Title, &e.Description, &e.DurationMinutes, &e.Location, &e.Timezone, &e.BufferBeforeMinutes, &e.BufferAfterMinutes, &e.MinNoticeMinutes, &e.MaxAdvanceDays, &e.SlotIntervalMinutes, &e.IsActive, &e.CreatedAt)
	return e, err
}

type CreateEventTypeInput struct {
	Slug                string
	Title               string
	Description         string
	DurationMinutes     int
	Location            string
	Timezone            string
	BufferBeforeMinutes int
	BufferAfterMinutes  int
	MinNoticeMinutes    int
	MaxAdvanceDays      int
	SlotIntervalMinutes int
}

func (s *Store) CreateEventType(orgID, projectID, hostUserID string, in CreateEventTypeInput) (EventType, error) {
	row := s.DB.QueryRow(`
		INSERT INTO event_types (id, organization_id, project_id, host_user_id, slug, title, description, duration_minutes, location, timezone, buffer_before_minutes, buffer_after_minutes, min_notice_minutes, max_advance_days, slot_interval_minutes)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING `+eventTypeSelect+`
	`, orgID, projectID, hostUserID, in.Slug, in.Title, in.Description, in.DurationMinutes, in.Location, in.Timezone, in.BufferBeforeMinutes, in.BufferAfterMinutes, in.MinNoticeMinutes, in.MaxAdvanceDays, in.SlotIntervalMinutes)
	return scanEventType(row)
}

// EventTypeOwnedBy resolves an event type only if it belongs to orgID —
// the tenant-isolation boundary for the authenticated management API.
// Deliberately org-scoped, not project-scoped: callers already have the
// event type's own id (from an already project-filtered list), so this is
// authorization, not a second filtering step. See ADR 0011.
func (s *Store) EventTypeOwnedBy(orgID, id string) (EventType, error) {
	row := s.DB.QueryRow(`SELECT `+eventTypeSelect+` FROM event_types WHERE id=$1 AND organization_id=$2`, id, orgID)
	return scanEventType(row)
}

// EventTypeByID resolves an event type with no organization scope — used
// only by the public booking flow, which is intentionally reachable by
// anyone who has the event type's (unguessable UUID) link.
func (s *Store) EventTypeByID(id string) (EventType, error) {
	row := s.DB.QueryRow(`SELECT `+eventTypeSelect+` FROM event_types WHERE id=$1 AND is_active=TRUE`, id)
	return scanEventType(row)
}

func (s *Store) ListEventTypes(orgID, projectID string) ([]EventType, error) {
	rows, err := s.DB.Query(`SELECT `+eventTypeSelect+` FROM event_types WHERE organization_id=$1 AND project_id=$2 ORDER BY created_at DESC`, orgID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []EventType{}
	for rows.Next() {
		e, err := scanEventType(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) DeleteEventType(orgID, id string) error {
	res, err := s.DB.Exec(`DELETE FROM event_types WHERE id=$1 AND organization_id=$2`, id, orgID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

type AvailabilityRule struct {
	Weekday     int `json:"weekday"`
	StartMinute int `json:"start_minute"`
	EndMinute   int `json:"end_minute"`
}

// ReplaceAvailabilityRules atomically swaps an event type's entire weekly
// schedule — simpler and safer than a partial add/remove API for a first
// version (no risk of a client's stale partial view silently reintroducing
// a deleted rule).
func (s *Store) ReplaceAvailabilityRules(eventTypeID string, rules []AvailabilityRule) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM availability_rules WHERE event_type_id=$1`, eventTypeID); err != nil {
		return err
	}
	for _, r := range rules {
		if _, err := tx.Exec(`
			INSERT INTO availability_rules (id, event_type_id, weekday, start_minute, end_minute)
			VALUES (gen_random_uuid(), $1, $2, $3, $4)
		`, eventTypeID, r.Weekday, r.StartMinute, r.EndMinute); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ListAvailabilityRules(eventTypeID string) ([]AvailabilityRule, error) {
	rows, err := s.DB.Query(`SELECT weekday, start_minute, end_minute FROM availability_rules WHERE event_type_id=$1 ORDER BY weekday, start_minute`, eventTypeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AvailabilityRule{}
	for rows.Next() {
		var r AvailabilityRule
		if err := rows.Scan(&r.Weekday, &r.StartMinute, &r.EndMinute); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

type AvailabilityOverride struct {
	Date        time.Time `json:"date"`
	Blocked     bool      `json:"blocked"`
	StartMinute int       `json:"start_minute,omitempty"`
	EndMinute   int       `json:"end_minute,omitempty"`
}

func (s *Store) UpsertAvailabilityOverride(eventTypeID string, o AvailabilityOverride) error {
	var startMin, endMin sql.NullInt32
	if !o.Blocked {
		startMin = sql.NullInt32{Int32: int32(o.StartMinute), Valid: true}
		endMin = sql.NullInt32{Int32: int32(o.EndMinute), Valid: true}
	}
	_, err := s.DB.Exec(`
		INSERT INTO availability_overrides (id, event_type_id, override_date, is_blocked, start_minute, end_minute)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
		ON CONFLICT (event_type_id, override_date)
		DO UPDATE SET is_blocked = EXCLUDED.is_blocked, start_minute = EXCLUDED.start_minute, end_minute = EXCLUDED.end_minute
	`, eventTypeID, o.Date.Format("2006-01-02"), o.Blocked, startMin, endMin)
	return err
}

func (s *Store) ListAvailabilityOverrides(eventTypeID string) ([]AvailabilityOverride, error) {
	rows, err := s.DB.Query(`SELECT override_date, is_blocked, start_minute, end_minute FROM availability_overrides WHERE event_type_id=$1 ORDER BY override_date`, eventTypeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AvailabilityOverride{}
	for rows.Next() {
		var o AvailabilityOverride
		var startMin, endMin sql.NullInt32
		if err := rows.Scan(&o.Date, &o.Blocked, &startMin, &endMin); err != nil {
			return nil, err
		}
		if startMin.Valid {
			o.StartMinute = int(startMin.Int32)
		}
		if endMin.Valid {
			o.EndMinute = int(endMin.Int32)
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

type Booking struct {
	ID               string     `json:"id"`
	OrganizationID   string     `json:"organization_id"`
	ProjectID        string     `json:"project_id"`
	EventTypeID      string     `json:"event_type_id"`
	StartsAt         time.Time  `json:"starts_at"`
	EndsAt           time.Time  `json:"ends_at"`
	AttendeeName     string     `json:"attendee_name"`
	AttendeeEmail    string     `json:"attendee_email"`
	AttendeeTimezone string     `json:"attendee_timezone"`
	Notes            string     `json:"notes"`
	Status           string     `json:"status"`
	ManageToken      string     `json:"manage_token,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	CancelledAt      *time.Time `json:"cancelled_at,omitempty"`
}

const bookingSelect = `id, organization_id, project_id, event_type_id, starts_at, ends_at, attendee_name, attendee_email, attendee_timezone, notes, status, manage_token, created_at, cancelled_at`

func scanBooking(row interface{ Scan(...any) error }) (Booking, error) {
	var b Booking
	var cancelledAt sql.NullTime
	err := row.Scan(&b.ID, &b.OrganizationID, &b.ProjectID, &b.EventTypeID, &b.StartsAt, &b.EndsAt, &b.AttendeeName, &b.AttendeeEmail, &b.AttendeeTimezone, &b.Notes, &b.Status, &b.ManageToken, &b.CreatedAt, &cancelledAt)
	if cancelledAt.Valid {
		b.CancelledAt = &cancelledAt.Time
	}
	return b, err
}

type CreateBookingInput struct {
	StartsAt         time.Time
	EndsAt           time.Time
	AttendeeName     string
	AttendeeEmail    string
	AttendeeTimezone string
	Notes            string
}

// CreateBooking inserts a booking with its buffer-padded busy range. On a
// slot collision (including a legitimate concurrent-request race — see
// the ADR) it returns ErrSlotConflict, not a generic error.
func (s *Store) CreateBooking(orgID string, et EventType, in CreateBookingInput) (Booking, error) {
	token, err := keys.NewManageToken()
	if err != nil {
		return Booking{}, err
	}
	busyStart := in.StartsAt.Add(-time.Duration(et.BufferBeforeMinutes) * time.Minute)
	busyEnd := in.EndsAt.Add(time.Duration(et.BufferAfterMinutes) * time.Minute)

	row := s.DB.QueryRow(`
		INSERT INTO bookings (id, organization_id, project_id, event_type_id, starts_at, ends_at, busy_starts_at, busy_ends_at, attendee_name, attendee_email, attendee_timezone, notes, manage_token)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING `+bookingSelect+`
	`, orgID, et.ProjectID, et.ID, in.StartsAt, in.EndsAt, busyStart, busyEnd, in.AttendeeName, in.AttendeeEmail, in.AttendeeTimezone, in.Notes, token)
	b, err := scanBooking(row)
	if isExclusionViolation(err) {
		return Booking{}, ErrSlotConflict
	}
	return b, err
}

func (s *Store) BookingByManageToken(token string) (Booking, error) {
	row := s.DB.QueryRow(`SELECT `+bookingSelect+` FROM bookings WHERE manage_token=$1`, token)
	return scanBooking(row)
}

// BookingOwnedBy resolves a booking only if it belongs to orgID — the
// tenant-isolation boundary for the authenticated dashboard's cancel
// action, keyed on the booking's own id (already org-scoped is sufficient;
// see ADR 0011 for why this isn't also project-scoped).
func (s *Store) BookingOwnedBy(orgID, id string) (Booking, error) {
	row := s.DB.QueryRow(`SELECT `+bookingSelect+` FROM bookings WHERE id=$1 AND organization_id=$2`, id, orgID)
	return scanBooking(row)
}

// RescheduleBooking moves a confirmed booking to a new time, re-checking
// the exclusion constraint (Postgres enforces it on UPDATE too) so a
// reschedule can never silently create a double-booking.
func (s *Store) RescheduleBooking(id string, et EventType, startsAt, endsAt time.Time) (Booking, error) {
	busyStart := startsAt.Add(-time.Duration(et.BufferBeforeMinutes) * time.Minute)
	busyEnd := endsAt.Add(time.Duration(et.BufferAfterMinutes) * time.Minute)
	row := s.DB.QueryRow(`
		UPDATE bookings
		SET starts_at=$1, ends_at=$2, busy_starts_at=$3, busy_ends_at=$4
		WHERE id=$5 AND status='confirmed'
		RETURNING `+bookingSelect+`
	`, startsAt, endsAt, busyStart, busyEnd, id)
	b, err := scanBooking(row)
	if isExclusionViolation(err) {
		return Booking{}, ErrSlotConflict
	}
	return b, err
}

func (s *Store) CancelBooking(id string) (Booking, error) {
	row := s.DB.QueryRow(`
		UPDATE bookings SET status='cancelled', cancelled_at=NOW()
		WHERE id=$1 AND status='confirmed'
		RETURNING `+bookingSelect+`
	`, id)
	return scanBooking(row)
}

// BusyRange is a confirmed booking's buffer-inclusive occupied window —
// feeds directly into availability.Busy.
type BusyRange struct {
	Start time.Time
	End   time.Time
}

func (s *Store) ListBusyRanges(eventTypeID string, from, to time.Time) ([]BusyRange, error) {
	rows, err := s.DB.Query(`
		SELECT busy_starts_at, busy_ends_at FROM bookings
		WHERE event_type_id=$1 AND status='confirmed' AND busy_ends_at > $2 AND busy_starts_at < $3
	`, eventTypeID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BusyRange{}
	for rows.Next() {
		var b BusyRange
		if err := rows.Scan(&b.Start, &b.End); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) ListBookingsForOrganization(orgID, projectID string, from, to time.Time) ([]Booking, error) {
	rows, err := s.DB.Query(`
		SELECT `+bookingSelect+` FROM bookings
		WHERE organization_id=$1 AND project_id=$2 AND starts_at >= $3 AND starts_at < $4
		ORDER BY starts_at ASC
	`, orgID, projectID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Booking{}
	for rows.Next() {
		b, err := scanBooking(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}
