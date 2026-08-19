package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// icsEscape escapes text per RFC 5545 §3.3.11.
func icsEscape(s string) string {
	r := strings.NewReplacer("\\", "\\\\", ";", "\\;", ",", "\\,", "\n", "\\n")
	return r.Replace(s)
}

func icsDateTime(t time.Time) string {
	return t.UTC().Format("20060102T150405Z")
}

// buildICS returns a minimal, valid single-event RFC 5545 calendar. Kept
// dependency-free (no ics library) since one VEVENT is all this needs.
func buildICS(uid, title, description, location string, start, end, createdAt time.Time, sequence int, status string) string {
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\r\n")
	b.WriteString("VERSION:2.0\r\n")
	b.WriteString("PRODID:-//Submify//Booking//EN\r\n")
	b.WriteString("CALSCALE:GREGORIAN\r\n")
	b.WriteString("METHOD:PUBLISH\r\n")
	b.WriteString("BEGIN:VEVENT\r\n")
	fmt.Fprintf(&b, "UID:%s@submify\r\n", uid)
	fmt.Fprintf(&b, "DTSTAMP:%s\r\n", icsDateTime(createdAt))
	fmt.Fprintf(&b, "DTSTART:%s\r\n", icsDateTime(start))
	fmt.Fprintf(&b, "DTEND:%s\r\n", icsDateTime(end))
	fmt.Fprintf(&b, "SUMMARY:%s\r\n", icsEscape(title))
	if description != "" {
		fmt.Fprintf(&b, "DESCRIPTION:%s\r\n", icsEscape(description))
	}
	if location != "" {
		fmt.Fprintf(&b, "LOCATION:%s\r\n", icsEscape(location))
	}
	fmt.Fprintf(&b, "SEQUENCE:%d\r\n", sequence)
	fmt.Fprintf(&b, "STATUS:%s\r\n", status)
	b.WriteString("END:VEVENT\r\n")
	b.WriteString("END:VCALENDAR\r\n")
	return b.String()
}

// PublicBookingICS serves a .ics file for a booking, keyed by its
// unguessable manage_token — same trust model as viewing/managing the
// booking itself.
func (s *Server) PublicBookingICS(c *gin.Context) {
	b, err := s.store.BookingByManageToken(c.Param("token"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "booking not found"})
		return
	}
	et, err := s.store.EventTypeByID(b.EventTypeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	status := "CONFIRMED"
	if b.Status == "cancelled" {
		status = "CANCELLED"
	}
	description := et.Description
	if b.Notes != "" {
		description = strings.TrimSpace(description + "\n\n" + b.Notes)
	}
	ics := buildICS(b.ID, et.Title, description, et.Location, b.StartsAt, b.EndsAt, b.CreatedAt, 0, status)

	c.Header("Content-Disposition", `attachment; filename="booking.ics"`)
	c.Data(http.StatusOK, "text/calendar; charset=utf-8", []byte(ics))
}
