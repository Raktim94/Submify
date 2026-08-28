package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/availability"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/telegram"
)

// resolveProjectID validates that projectID both is non-empty and actually
// belongs to orgID — the IDOR boundary for scoping calendar data to one
// project, matching the check every other project-scoped endpoint already
// applies via ProjectOwnedBy. Writes the error response itself and returns
// ok=false when the caller should stop. See ADR 0011.
func (s *Server) resolveProjectID(c *gin.Context, orgID, projectID string) (string, bool) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "project_id is required"})
		return "", false
	}
	if _, err := s.store.ProjectOwnedBy(orgID, projectID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return "", false
	}
	return projectID, true
}

// notifyHostOfBooking fires a best-effort Telegram notification to the
// event type's host (account-level bot token/chat ID — bookings don't
// belong to a project the way submissions do, so there's no per-project
// Telegram target to prefer). Silently does nothing if the host hasn't
// configured Telegram, matching how submission notifications behave.
func (s *Server) notifyHostOfBooking(et db.EventType, action string, b db.Booking) {
	host, err := s.store.FindUserByID(et.HostUserID)
	if err != nil {
		return
	}
	msg := fmt.Sprintf(
		"Booking %s\nEvent: %s\nWhen: %s\nAttendee: %s (%s)\nAttendee timezone: %s",
		action, et.Title, b.StartsAt.Local().Format("Mon, Jan 2 2006 3:04 PM"), b.AttendeeName, b.AttendeeEmail, b.AttendeeTimezone,
	)
	telegram.NotifyAsync(host.TelegramBotToken, host.TelegramChatID, msg)
}

type ruleRequest struct {
	Weekday     int `json:"weekday" binding:"min=0,max=6"`
	StartMinute int `json:"start_minute" binding:"min=0,max=1439"`
	EndMinute   int `json:"end_minute" binding:"min=1,max=1440"`
}

type createEventTypeRequest struct {
	ProjectID           string        `json:"project_id" binding:"required"`
	Slug                string        `json:"slug" binding:"required"`
	Title               string        `json:"title" binding:"required"`
	Description         string        `json:"description"`
	DurationMinutes     int           `json:"duration_minutes" binding:"required,min=1"`
	Location            string        `json:"location"`
	Timezone            string        `json:"timezone" binding:"required"`
	BufferBeforeMinutes int           `json:"buffer_before_minutes"`
	BufferAfterMinutes  int           `json:"buffer_after_minutes"`
	MinNoticeMinutes    int           `json:"min_notice_minutes"`
	MaxAdvanceDays      int           `json:"max_advance_days"`
	SlotIntervalMinutes int           `json:"slot_interval_minutes"`
	Rules               []ruleRequest `json:"rules"`
}

func (s *Server) CreateEventType(c *gin.Context) {
	var req createEventTypeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := time.LoadLocation(req.Timezone); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid timezone: " + err.Error()})
		return
	}
	if req.MaxAdvanceDays <= 0 {
		req.MaxAdvanceDays = 60
	}
	if req.SlotIntervalMinutes <= 0 {
		req.SlotIntervalMinutes = 15
	}

	orgID := organizationIDFromContext(c)
	projectID, ok := s.resolveProjectID(c, orgID, req.ProjectID)
	if !ok {
		return
	}
	userID := userIDFromContext(c)
	et, err := s.store.CreateEventType(orgID, projectID, userID, db.CreateEventTypeInput{
		Slug: req.Slug, Title: req.Title, Description: req.Description,
		DurationMinutes: req.DurationMinutes, Location: req.Location, Timezone: req.Timezone,
		BufferBeforeMinutes: req.BufferBeforeMinutes, BufferAfterMinutes: req.BufferAfterMinutes,
		MinNoticeMinutes: req.MinNoticeMinutes, MaxAdvanceDays: req.MaxAdvanceDays,
		SlotIntervalMinutes: req.SlotIntervalMinutes,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rules := make([]db.AvailabilityRule, 0, len(req.Rules))
	for _, r := range req.Rules {
		rules = append(rules, db.AvailabilityRule{Weekday: r.Weekday, StartMinute: r.StartMinute, EndMinute: r.EndMinute})
	}
	if len(rules) > 0 {
		if err := s.store.ReplaceAvailabilityRules(et.ID, rules); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusCreated, gin.H{"event_type": et, "rules": rules})
}

func (s *Server) ListEventTypes(c *gin.Context) {
	orgID := organizationIDFromContext(c)
	projectID, ok := s.resolveProjectID(c, orgID, c.Query("project_id"))
	if !ok {
		return
	}
	items, err := s.store.ListEventTypes(orgID, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"event_types": items})
}

func (s *Server) GetEventType(c *gin.Context) {
	et, err := s.store.EventTypeOwnedBy(organizationIDFromContext(c), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event type not found"})
		return
	}
	rules, err := s.store.ListAvailabilityRules(et.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	overrides, err := s.store.ListAvailabilityOverrides(et.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"event_type": et, "rules": rules, "overrides": overrides})
}

func (s *Server) DeleteEventType(c *gin.Context) {
	if err := s.store.DeleteEventType(organizationIDFromContext(c), c.Param("id")); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

type overrideRequest struct {
	Date        string `json:"date" binding:"required"` // YYYY-MM-DD
	Blocked     bool   `json:"blocked"`
	StartMinute int    `json:"start_minute"`
	EndMinute   int    `json:"end_minute"`
}

func (s *Server) UpsertEventTypeOverride(c *gin.Context) {
	et, err := s.store.EventTypeOwnedBy(organizationIDFromContext(c), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event type not found"})
		return
	}
	var req overrideRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be YYYY-MM-DD"})
		return
	}
	if err := s.store.UpsertAvailabilityOverride(et.ID, db.AvailabilityOverride{
		Date: date, Blocked: req.Blocked, StartMinute: req.StartMinute, EndMinute: req.EndMinute,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// ListOrgBookings is the authenticated dashboard view of the
// organization's bookings within a date range (defaults to the next 30
// days, matching the "upcoming bookings" view in brief §13).
func (s *Server) ListOrgBookings(c *gin.Context) {
	orgID := organizationIDFromContext(c)
	projectID, ok := s.resolveProjectID(c, orgID, c.Query("project_id"))
	if !ok {
		return
	}
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
	items, err := s.store.ListBookingsForOrganization(orgID, projectID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"bookings": items})
}

func (s *Server) CancelOrgBooking(c *gin.Context) {
	// Org-scoped: confirm the booking actually belongs to this organization
	// before cancelling, even though cancellation is keyed by booking ID.
	orgID := organizationIDFromContext(c)
	if _, err := s.store.BookingOwnedBy(orgID, c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking not found"})
		return
	}
	b, err := s.store.CancelBooking(c.Param("id"))
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"booking": b})
}

// --- Public booking flow (no auth — reachable via a shared link, like the
// existing client portal / presigned uploads) ---

func (s *Server) PublicEventType(c *gin.Context) {
	et, err := s.store.EventTypeByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id": et.ID, "title": et.Title, "description": et.Description,
		"duration_minutes": et.DurationMinutes, "location": et.Location, "timezone": et.Timezone,
	})
}

func (s *Server) PublicEventTypeSlots(c *gin.Context) {
	et, err := s.store.EventTypeByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	rules, err := s.store.ListAvailabilityRules(et.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dbOverrides, err := s.store.ListAvailabilityOverrides(et.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	now := time.Now().UTC()
	horizon := now.AddDate(0, 0, et.MaxAdvanceDays+1)
	busyRanges, err := s.store.ListBusyRanges(et.ID, now, horizon)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	cfg := availability.Config{
		Timezone: et.Timezone, DurationMinutes: et.DurationMinutes,
		BufferBeforeMinutes: et.BufferBeforeMinutes, BufferAfterMinutes: et.BufferAfterMinutes,
		MinNoticeMinutes: et.MinNoticeMinutes, MaxAdvanceDays: et.MaxAdvanceDays,
		SlotIntervalMinutes: et.SlotIntervalMinutes,
	}
	for _, r := range rules {
		cfg.Rules = append(cfg.Rules, availability.Rule{Weekday: time.Weekday(r.Weekday), StartMinute: r.StartMinute, EndMinute: r.EndMinute})
	}
	for _, o := range dbOverrides {
		cfg.Overrides = append(cfg.Overrides, availability.Override{Date: o.Date, Blocked: o.Blocked, StartMinute: o.StartMinute, EndMinute: o.EndMinute})
	}
	var busy []availability.Busy
	for _, b := range busyRanges {
		busy = append(busy, availability.Busy{Start: b.Start, End: b.End})
	}

	slots, err := availability.AvailableSlots(cfg, now, busy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(slots))
	for _, sl := range slots {
		out = append(out, gin.H{"start": sl.Start.Format(time.RFC3339), "end": sl.End.Format(time.RFC3339)})
	}
	c.JSON(http.StatusOK, gin.H{"slots": out, "timezone": et.Timezone})
}

type createBookingRequest struct {
	StartsAt         string `json:"starts_at" binding:"required"` // RFC3339
	AttendeeName     string `json:"attendee_name" binding:"required"`
	AttendeeEmail    string `json:"attendee_email" binding:"required,email"`
	AttendeeTimezone string `json:"attendee_timezone"`
	Notes            string `json:"notes"`
}

func (s *Server) PublicCreateBooking(c *gin.Context) {
	et, err := s.store.EventTypeByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req createBookingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	startsAt, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "starts_at must be RFC3339"})
		return
	}
	if startsAt.Before(time.Now().UTC().Add(time.Duration(et.MinNoticeMinutes) * time.Minute)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "that time no longer meets the minimum notice window"})
		return
	}
	endsAt := startsAt.Add(time.Duration(et.DurationMinutes) * time.Minute)

	b, err := s.store.CreateBooking(et.OrganizationID, et, db.CreateBookingInput{
		StartsAt: startsAt, EndsAt: endsAt,
		AttendeeName: req.AttendeeName, AttendeeEmail: req.AttendeeEmail,
		AttendeeTimezone: req.AttendeeTimezone, Notes: req.Notes,
	})
	if err != nil {
		if errors.Is(err, db.ErrSlotConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.notifyHostOfBooking(et, "created", b)
	c.JSON(http.StatusCreated, gin.H{"booking": b, "manage_url": s.absoluteAPIURL(c, "/api/v1/public/bookings/"+b.ManageToken)})
}

func (s *Server) PublicGetBooking(c *gin.Context) {
	b, err := s.store.BookingByManageToken(c.Param("token"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"booking": b})
}

type rescheduleBookingRequest struct {
	StartsAt string `json:"starts_at" binding:"required"`
}

func (s *Server) PublicRescheduleBooking(c *gin.Context) {
	b, err := s.store.BookingByManageToken(c.Param("token"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking not found"})
		return
	}
	if b.Status != "confirmed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this booking is not active"})
		return
	}
	et, err := s.store.EventTypeByID(b.EventTypeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var req rescheduleBookingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	startsAt, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "starts_at must be RFC3339"})
		return
	}
	endsAt := startsAt.Add(time.Duration(et.DurationMinutes) * time.Minute)
	updated, err := s.store.RescheduleBooking(b.ID, et, startsAt, endsAt)
	if err != nil {
		if errors.Is(err, db.ErrSlotConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	s.notifyHostOfBooking(et, "rescheduled", updated)
	c.JSON(http.StatusOK, gin.H{"booking": updated})
}

func (s *Server) PublicCancelBooking(c *gin.Context) {
	b, err := s.store.BookingByManageToken(c.Param("token"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking not found"})
		return
	}
	updated, err := s.store.CancelBooking(b.ID)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusBadRequest // already cancelled
		}
		c.JSON(status, gin.H{"error": "could not cancel: " + err.Error()})
		return
	}
	if et, etErr := s.store.EventTypeByID(b.EventTypeID); etErr == nil {
		s.notifyHostOfBooking(et, "cancelled", updated)
	}
	c.JSON(http.StatusOK, gin.H{"booking": updated})
}
