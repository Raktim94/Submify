package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// Read-only calendar views for the client portal. See
// docs/decisions/0010-portal-calendar-read-only.md for the scope decision:
// a portal visitor can *view* the organization's real bookings in a real
// month/week/day calendar, but cannot create, reschedule, or cancel a
// booking, and never sees personal_events (private per-user agenda items —
// docs/decisions/0008-personal-calendar-events.md), which these handlers
// deliberately never query.

// portalEventType is a read-only subset of db.EventType for the portal
// calendar — strips host_user_id and scheduling-policy internals
// (buffers/min-notice/slot interval/max-advance) that a portal viewer has
// no use for and that aren't needed to label a booking on the grid.
type portalEventType struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	DurationMinutes int    `json:"duration_minutes"`
	Location        string `json:"location"`
	Timezone        string `json:"timezone"`
	IsActive        bool   `json:"is_active"`
}

// portalBooking is a deliberately minimized read-only view of a booking,
// safe for exposure through a project's shared portal link. It omits the
// manage_token (a bearer credential that would let its holder reschedule or
// cancel the real booking) and the attendee's email/notes — neither is
// needed to render a calendar, and both would otherwise leak PII about the
// organization's *other* clients to whoever holds this one project's portal
// password (bookings are organization-scoped, not project-scoped).
type portalBooking struct {
	ID             string     `json:"id"`
	EventTypeID    string     `json:"event_type_id"`
	EventTypeTitle string     `json:"event_type_title"`
	Location       string     `json:"location"`
	StartsAt       time.Time  `json:"starts_at"`
	EndsAt         time.Time  `json:"ends_at"`
	AttendeeName   string     `json:"attendee_name"`
	Status         string     `json:"status"`
	CreatedAt      time.Time  `json:"created_at"`
	CancelledAt    *time.Time `json:"cancelled_at,omitempty"`
}

// PortalEventTypes lists the portal session's organization's event types
// (read-only) so the portal calendar UI can label bookings by title/
// location. Includes inactive event types too — a past booking can
// reference one, and dropping it would leave that booking unlabeled.
func (s *Server) PortalEventTypes(c *gin.Context) {
	orgID := c.GetString("portal_organization_id")
	items, err := s.store.ListEventTypes(orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]portalEventType, 0, len(items))
	for _, et := range items {
		out = append(out, portalEventType{
			ID:              et.ID,
			Title:           et.Title,
			Description:     et.Description,
			DurationMinutes: et.DurationMinutes,
			Location:        et.Location,
			Timezone:        et.Timezone,
			IsActive:        et.IsActive,
		})
	}
	c.JSON(http.StatusOK, gin.H{"event_types": out})
}

// PortalBookings lists the portal session's organization's bookings within
// a date range (defaults to the next 30 days, matching the authenticated
// dashboard's ListOrgBookings), stripped down to portalBooking's read-only,
// PII-minimized shape.
func (s *Server) PortalBookings(c *gin.Context) {
	orgID := c.GetString("portal_organization_id")
	from := time.Now().UTC()
	to := from.AddDate(0, 0, 30)
	if v := c.Query("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			from = t
		}
	}
	if v := c.Query("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			to = t
		}
	}
	bookings, err := s.store.ListBookingsForOrganization(orgID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	eventTypes, err := s.store.ListEventTypes(orgID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	titleByID := make(map[string]string, len(eventTypes))
	locationByID := make(map[string]string, len(eventTypes))
	for _, et := range eventTypes {
		titleByID[et.ID] = et.Title
		locationByID[et.ID] = et.Location
	}

	out := make([]portalBooking, 0, len(bookings))
	for _, b := range bookings {
		out = append(out, portalBooking{
			ID:             b.ID,
			EventTypeID:    b.EventTypeID,
			EventTypeTitle: titleByID[b.EventTypeID],
			Location:       locationByID[b.EventTypeID],
			StartsAt:       b.StartsAt,
			EndsAt:         b.EndsAt,
			AttendeeName:   b.AttendeeName,
			Status:         b.Status,
			CreatedAt:      b.CreatedAt,
			CancelledAt:    b.CancelledAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"bookings": out, "from": from.Format(time.RFC3339), "to": to.Format(time.RFC3339)})
}
