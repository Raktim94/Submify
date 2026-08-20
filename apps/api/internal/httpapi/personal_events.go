package httpapi

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nodedr/submify/apps/api/internal/db"
	"github.com/nodedr/submify/apps/api/internal/telegram"
)

var validPersonalEventKinds = map[string]bool{"event": true, "task": true, "reminder": true}

func parsePersonalEventTimeField(v string, fieldName string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be RFC3339", fieldName)
	}
	return t, nil
}

type createPersonalEventRequest struct {
	Title       string  `json:"title" binding:"required"`
	Description string  `json:"description"`
	Kind        string  `json:"kind"`
	StartsAt    string  `json:"starts_at" binding:"required"`
	EndsAt      *string `json:"ends_at"`
	AllDay      bool    `json:"all_day"`
	Color       string  `json:"color"`
	RemindAt    *string `json:"remind_at"`
}

func (s *Server) CreatePersonalEvent(c *gin.Context) {
	var req createPersonalEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Kind == "" {
		req.Kind = "event"
	}
	if !validPersonalEventKinds[req.Kind] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kind must be one of: event, task, reminder"})
		return
	}
	if req.Color == "" {
		req.Color = "indigo"
	}

	startsAt, err := parsePersonalEventTimeField(req.StartsAt, "starts_at")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var endsAt, remindAt *time.Time
	if req.EndsAt != nil && *req.EndsAt != "" {
		t, err := parsePersonalEventTimeField(*req.EndsAt, "ends_at")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		endsAt = &t
	}
	if req.RemindAt != nil && *req.RemindAt != "" {
		t, err := parsePersonalEventTimeField(*req.RemindAt, "remind_at")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		remindAt = &t
	}

	item, err := s.store.CreatePersonalEvent(organizationIDFromContext(c), userIDFromContext(c), db.PersonalEventInput{
		Title: req.Title, Description: req.Description, Kind: req.Kind,
		StartsAt: startsAt, EndsAt: endsAt, AllDay: req.AllDay, Color: req.Color, RemindAt: remindAt,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"item": item})
}

// ListPersonalEvents requires both from/to (unlike ListOrgBookings, which
// defaults to a rolling 30 days) — the calendar UI always has a concrete
// visible date range (the current month/week/day grid), so there's no
// sensible default to fall back to here.
func (s *Server) ListPersonalEvents(c *gin.Context) {
	fromStr, toStr := c.Query("from"), c.Query("to")
	if fromStr == "" || toStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from and to (RFC3339) are required"})
		return
	}
	from, err := parsePersonalEventTimeField(fromStr, "from")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	to, err := parsePersonalEventTimeField(toStr, "to")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	items, err := s.store.ListPersonalEvents(organizationIDFromContext(c), userIDFromContext(c), from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// updatePersonalEventRequest: a nil pointer means "leave this field
// unchanged." For the two nullable time fields (EndsAt/RemindAt), the
// client must send an explicit empty string "" to clear them — omitting
// the key (or the frontend never sending JSON `null`) leaves them as-is.
// This is a deliberately simple convention (documented in
// lib/personal-events.ts on the frontend) rather than pulling in a JSON-
// Patch library for one small entity.
type updatePersonalEventRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Kind        *string `json:"kind"`
	StartsAt    *string `json:"starts_at"`
	EndsAt      *string `json:"ends_at"`
	AllDay      *bool   `json:"all_day"`
	Color       *string `json:"color"`
	IsCompleted *bool   `json:"is_completed"`
	RemindAt    *string `json:"remind_at"`
}

func (s *Server) UpdatePersonalEvent(c *gin.Context) {
	orgID, userID, id := organizationIDFromContext(c), userIDFromContext(c), c.Param("id")
	existing, err := s.store.PersonalEventOwnedBy(orgID, userID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var req updatePersonalEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	in := db.PersonalEventInput{
		Title: existing.Title, Description: existing.Description, Kind: existing.Kind,
		StartsAt: existing.StartsAt, EndsAt: existing.EndsAt, AllDay: existing.AllDay,
		Color: existing.Color, IsCompleted: existing.IsCompleted, RemindAt: existing.RemindAt,
	}
	if req.Title != nil {
		in.Title = *req.Title
	}
	if req.Description != nil {
		in.Description = *req.Description
	}
	if req.Kind != nil {
		if !validPersonalEventKinds[*req.Kind] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "kind must be one of: event, task, reminder"})
			return
		}
		in.Kind = *req.Kind
	}
	if req.StartsAt != nil {
		t, err := parsePersonalEventTimeField(*req.StartsAt, "starts_at")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		in.StartsAt = t
	}
	if req.EndsAt != nil {
		if *req.EndsAt == "" {
			in.EndsAt = nil
		} else {
			t, err := parsePersonalEventTimeField(*req.EndsAt, "ends_at")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			in.EndsAt = &t
		}
	}
	if req.AllDay != nil {
		in.AllDay = *req.AllDay
	}
	if req.Color != nil {
		in.Color = *req.Color
	}
	if req.IsCompleted != nil {
		in.IsCompleted = *req.IsCompleted
	}
	if req.RemindAt != nil {
		if *req.RemindAt == "" {
			in.RemindAt = nil
		} else {
			t, err := parsePersonalEventTimeField(*req.RemindAt, "remind_at")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			in.RemindAt = &t
		}
	}

	item, err := s.store.UpdatePersonalEvent(orgID, userID, id, in)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": item})
}

func (s *Server) DeletePersonalEvent(c *gin.Context) {
	if err := s.store.DeletePersonalEvent(organizationIDFromContext(c), userIDFromContext(c), c.Param("id")); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, sql.ErrNoRows) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// dispatchDueReminders is called on a ticker from StartBackgroundJobs. It's
// a system-wide sweep — see db.DueReminders — so unlike every other
// handler in this file it does NOT take a *gin.Context or scope by
// org/user; each due item already carries its own organization_id/user_id.
// Best-effort, same as notifyHostOfBooking: a user with no Telegram
// configured just gets no notification, not an error.
func (s *Server) dispatchDueReminders() {
	items, err := s.store.DueReminders(time.Now().UTC())
	if err != nil {
		return
	}
	for _, item := range items {
		user, err := s.store.FindUserByID(item.UserID)
		if err == nil {
			when := item.StartsAt.Local().Format("Mon, Jan 2 2006 3:04 PM")
			msg := fmt.Sprintf("Reminder: %s\nWhen: %s", item.Title, when)
			if item.Description != "" {
				msg += "\n" + item.Description
			}
			telegram.NotifyAsync(user.TelegramBotToken, user.TelegramChatID, msg)
		}
		// Marked sent regardless of the FindUserByID/Telegram-config outcome
		// above — an item whose owner has no Telegram set up (or was
		// deleted) must not be re-swept and retried forever once its
		// reminder time has passed.
		_ = s.store.MarkReminderSent(item.ID)
	}
}
