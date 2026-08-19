// Package availability computes bookable time slots from a weekly
// recurring schedule, date-specific overrides, and existing bookings.
//
// Timezone/DST correctness (see docs/decisions/0005-calendar-booking-architecture.md):
// every wall-clock boundary ("9am-5pm on Monday") is resolved to UTC via
// time.Date(..., loc) for the *specific calendar date* being evaluated,
// never by adding a fixed time.Duration to a UTC instant — the latter
// silently computes the wrong wall-clock time across a DST transition.
package availability

import (
	"fmt"
	"sort"
	"time"
)

// Rule is a weekly recurring availability window, in the event type's
// timezone. Weekday follows time.Weekday (0=Sunday..6=Saturday).
type Rule struct {
	Weekday     time.Weekday
	StartMinute int // minutes since local midnight
	EndMinute   int
}

// Override replaces a rule for one specific calendar date (in the event
// type's timezone) — either fully blocking it or giving it custom hours.
type Override struct {
	Date        time.Time // only Year/Month/Day are used
	Blocked     bool
	StartMinute int // ignored if Blocked
	EndMinute   int // ignored if Blocked
}

// Config is everything needed to compute slots for one event type.
type Config struct {
	Timezone            string // IANA name, e.g. "America/New_York"
	Rules               []Rule
	Overrides           []Override
	DurationMinutes     int
	BufferBeforeMinutes int
	BufferAfterMinutes  int
	MinNoticeMinutes    int
	MaxAdvanceDays      int
	SlotIntervalMinutes int
}

// Busy is an existing occupied range, in UTC — pass each confirmed
// booking's buffer-inclusive busy_starts_at/busy_ends_at here.
type Busy struct {
	Start time.Time
	End   time.Time
}

// Slot is one bookable window, in UTC.
type Slot struct {
	Start time.Time
	End   time.Time
}

// AvailableSlots returns every bookable slot from now until
// now+MaxAdvanceDays, respecting rules/overrides/buffers/min-notice/slot
// interval, excluding anything that overlaps an entry in busy. now must be
// UTC (or any consistent zone — only instant comparisons are made against
// it after localization).
func AvailableSlots(cfg Config, now time.Time, busy []Busy) ([]Slot, error) {
	if cfg.DurationMinutes <= 0 {
		return nil, fmt.Errorf("duration must be positive")
	}
	if cfg.SlotIntervalMinutes <= 0 {
		return nil, fmt.Errorf("slot interval must be positive")
	}
	loc, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		return nil, fmt.Errorf("loading timezone %q: %w", cfg.Timezone, err)
	}

	rulesByWeekday := map[time.Weekday][]Rule{}
	for _, r := range cfg.Rules {
		rulesByWeekday[r.Weekday] = append(rulesByWeekday[r.Weekday], r)
	}
	overridesByDate := map[string]Override{}
	for _, o := range cfg.Overrides {
		overridesByDate[o.Date.Format("2006-01-02")] = o
	}

	earliestStart := now.Add(time.Duration(cfg.MinNoticeMinutes) * time.Minute)
	horizon := now.AddDate(0, 0, cfg.MaxAdvanceDays)

	var slots []Slot
	nowLocal := now.In(loc)
	for d := 0; d <= cfg.MaxAdvanceDays; d++ {
		day := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, d)
		dateKey := day.Format("2006-01-02")

		var windows []Rule
		if ov, ok := overridesByDate[dateKey]; ok {
			if !ov.Blocked {
				windows = []Rule{{Weekday: day.Weekday(), StartMinute: ov.StartMinute, EndMinute: ov.EndMinute}}
			}
			// Blocked override → windows stays empty for this date.
		} else {
			windows = rulesByWeekday[day.Weekday()]
		}

		for _, w := range windows {
			// time.Date resolves the correct UTC offset for THIS date,
			// which is what makes DST transitions handled correctly —
			// the same StartMinute/EndMinute can legitimately produce a
			// different UTC instant on either side of a transition.
			windowStart := time.Date(day.Year(), day.Month(), day.Day(), 0, w.StartMinute, 0, 0, loc)
			windowEnd := time.Date(day.Year(), day.Month(), day.Day(), 0, w.EndMinute, 0, 0, loc)

			for cursor := windowStart; !cursor.After(windowEnd.Add(-time.Duration(cfg.DurationMinutes) * time.Minute)); cursor = cursor.Add(time.Duration(cfg.SlotIntervalMinutes) * time.Minute) {
				slotStart := cursor
				slotEnd := cursor.Add(time.Duration(cfg.DurationMinutes) * time.Minute)
				if slotEnd.After(windowEnd) {
					continue
				}
				if slotStart.Before(earliestStart) {
					continue
				}
				if slotStart.After(horizon) {
					continue
				}
				busyStart := slotStart.Add(-time.Duration(cfg.BufferBeforeMinutes) * time.Minute)
				busyEnd := slotEnd.Add(time.Duration(cfg.BufferAfterMinutes) * time.Minute)
				if overlapsAny(busyStart, busyEnd, busy) {
					continue
				}
				slots = append(slots, Slot{Start: slotStart.UTC(), End: slotEnd.UTC()})
			}
		}
	}

	sort.Slice(slots, func(i, j int) bool { return slots[i].Start.Before(slots[j].Start) })
	return slots, nil
}

func overlapsAny(start, end time.Time, busy []Busy) bool {
	for _, b := range busy {
		if start.Before(b.End) && end.After(b.Start) {
			return true
		}
	}
	return false
}
