package db

import (
	"database/sql"
	"time"
)

// PersonalEvent is a user's own private agenda item — a task, a note about
// what they're doing that day, or a reminder. Distinct from EventType/
// Booking, which model external/attendee scheduling: a personal event is
// never visible to anyone but the user who created it (see
// docs/decisions/0008-personal-calendar-events.md).
type PersonalEvent struct {
	ID             string     `json:"id"`
	OrganizationID string     `json:"organization_id"`
	UserID         string     `json:"user_id"`
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	Kind           string     `json:"kind"`
	StartsAt       time.Time  `json:"starts_at"`
	EndsAt         *time.Time `json:"ends_at,omitempty"`
	AllDay         bool       `json:"all_day"`
	Color          string     `json:"color"`
	IsCompleted    bool       `json:"is_completed"`
	RemindAt       *time.Time `json:"remind_at,omitempty"`
	ReminderSentAt *time.Time `json:"reminder_sent_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

const personalEventSelect = `id, organization_id, user_id, title, description, kind, starts_at, ends_at, all_day, color, is_completed, remind_at, reminder_sent_at, created_at, updated_at`

func scanPersonalEvent(row interface{ Scan(...any) error }) (PersonalEvent, error) {
	var e PersonalEvent
	var endsAt, remindAt, reminderSentAt sql.NullTime
	err := row.Scan(&e.ID, &e.OrganizationID, &e.UserID, &e.Title, &e.Description, &e.Kind, &e.StartsAt, &endsAt, &e.AllDay, &e.Color, &e.IsCompleted, &remindAt, &reminderSentAt, &e.CreatedAt, &e.UpdatedAt)
	if endsAt.Valid {
		e.EndsAt = &endsAt.Time
	}
	if remindAt.Valid {
		e.RemindAt = &remindAt.Time
	}
	if reminderSentAt.Valid {
		e.ReminderSentAt = &reminderSentAt.Time
	}
	return e, err
}

// PersonalEventInput is a full-row shape used by both create and update —
// the HTTP layer resolves PATCH's partial-field semantics (fetch existing,
// merge only the fields the client actually sent, then call Update with the
// merged whole) so this store layer stays a plain, unconditional replace,
// matching scanPersonalEvent's own all-columns shape.
type PersonalEventInput struct {
	Title       string
	Description string
	Kind        string
	StartsAt    time.Time
	EndsAt      *time.Time
	AllDay      bool
	Color       string
	IsCompleted bool
	RemindAt    *time.Time
}

func nullableTime(t *time.Time) sql.NullTime {
	if t == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *t, Valid: true}
}

func (s *Store) CreatePersonalEvent(orgID, userID string, in PersonalEventInput) (PersonalEvent, error) {
	row := s.DB.QueryRow(`
		INSERT INTO personal_events (id, organization_id, user_id, title, description, kind, starts_at, ends_at, all_day, color, is_completed, remind_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING `+personalEventSelect+`
	`, orgID, userID, in.Title, in.Description, in.Kind, in.StartsAt, nullableTime(in.EndsAt), in.AllDay, in.Color, in.IsCompleted, nullableTime(in.RemindAt))
	return scanPersonalEvent(row)
}

// ListPersonalEvents returns items whose range overlaps [from, to) —
// scoped by BOTH organization_id (tenant isolation) and user_id (privacy:
// one user never sees another's personal items, even within the same
// organization). Items with no ends_at (a reminder/task with a single
// point in time) are treated as overlapping if starts_at alone falls in
// range.
func (s *Store) ListPersonalEvents(orgID, userID string, from, to time.Time) ([]PersonalEvent, error) {
	rows, err := s.DB.Query(`
		SELECT `+personalEventSelect+` FROM personal_events
		WHERE organization_id=$1 AND user_id=$2
		  AND starts_at < $4
		  AND COALESCE(ends_at, starts_at) >= $3
		ORDER BY starts_at ASC
	`, orgID, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PersonalEvent{}
	for rows.Next() {
		e, err := scanPersonalEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// PersonalEventOwnedBy resolves an item only if it belongs to both orgID
// and userID — used by the PATCH handler to fetch-before-merge, and is
// itself the privacy boundary (an org-mate can never fetch, let alone
// edit, someone else's personal item).
func (s *Store) PersonalEventOwnedBy(orgID, userID, id string) (PersonalEvent, error) {
	row := s.DB.QueryRow(`SELECT `+personalEventSelect+` FROM personal_events WHERE id=$1 AND organization_id=$2 AND user_id=$3`, id, orgID, userID)
	return scanPersonalEvent(row)
}

func (s *Store) UpdatePersonalEvent(orgID, userID, id string, in PersonalEventInput) (PersonalEvent, error) {
	row := s.DB.QueryRow(`
		UPDATE personal_events
		SET title=$1, description=$2, kind=$3, starts_at=$4, ends_at=$5, all_day=$6, color=$7, is_completed=$8, remind_at=$9,
		    reminder_sent_at = CASE WHEN remind_at IS DISTINCT FROM $9 THEN NULL ELSE reminder_sent_at END,
		    updated_at = NOW()
		WHERE id=$10 AND organization_id=$11 AND user_id=$12
		RETURNING `+personalEventSelect+`
	`, in.Title, in.Description, in.Kind, in.StartsAt, nullableTime(in.EndsAt), in.AllDay, in.Color, in.IsCompleted, nullableTime(in.RemindAt), id, orgID, userID)
	return scanPersonalEvent(row)
}

func (s *Store) DeletePersonalEvent(orgID, userID, id string) error {
	res, err := s.DB.Exec(`DELETE FROM personal_events WHERE id=$1 AND organization_id=$2 AND user_id=$3`, id, orgID, userID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// DueReminders is a system-wide sweep (no org/user filter — the background
// dispatch job runs once for the whole instance) of items whose reminder
// time has passed and hasn't been sent yet. Backed by
// idx_personal_events_due_reminders, so this stays cheap regardless of
// total table size.
func (s *Store) DueReminders(now time.Time) ([]PersonalEvent, error) {
	rows, err := s.DB.Query(`
		SELECT `+personalEventSelect+` FROM personal_events
		WHERE remind_at IS NOT NULL AND remind_at <= $1 AND reminder_sent_at IS NULL
		ORDER BY remind_at ASC
	`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PersonalEvent{}
	for rows.Next() {
		e, err := scanPersonalEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// MarkReminderSent is called after a dispatch attempt REGARDLESS of
// whether Telegram was actually configured for that user — an
// unconfigured user's reminder must not be retried forever once its time
// has passed, matching how submission/booking notifications already
// silently no-op rather than error when Telegram isn't set up.
func (s *Store) MarkReminderSent(id string) error {
	_, err := s.DB.Exec(`UPDATE personal_events SET reminder_sent_at=NOW() WHERE id=$1`, id)
	return err
}
