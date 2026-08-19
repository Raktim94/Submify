package availability

import (
	"testing"
	"time"

	_ "time/tzdata" // embed IANA db so this test doesn't depend on the OS having it
)

func mustLoc(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("LoadLocation(%q): %v", name, err)
	}
	return loc
}

// A weekday 09:00-17:00 rule must resolve to different UTC offsets in
// winter (EST, UTC-5) vs. summer (EDT, UTC-4) for America/New_York — this
// is only true if wall-clock boundaries are resolved per-date via
// time.Date(...,loc), not by adding a fixed duration to a UTC instant.
func TestAvailableSlots_DST_WinterVsSummerOffsetDiffers(t *testing.T) {
	ny := mustLoc(t, "America/New_York")

	cfg := Config{
		Timezone:            "America/New_York",
		DurationMinutes:     30,
		SlotIntervalMinutes: 30,
		MaxAdvanceDays:      400,
		MinNoticeMinutes:    0,
	}

	// 2026-01-12 is a Monday (deep winter, EST = UTC-5).
	winterMonday := time.Date(2026, 1, 12, 0, 0, 0, 0, ny)
	cfg.Rules = []Rule{{Weekday: winterMonday.Weekday(), StartMinute: 9 * 60, EndMinute: 9*60 + 30}}
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	slots, err := AvailableSlots(cfg, now, nil)
	if err != nil {
		t.Fatalf("AvailableSlots: %v", err)
	}
	var winterSlot *Slot
	for i := range slots {
		if slots[i].Start.In(ny).Format("2006-01-02") == "2026-01-12" {
			winterSlot = &slots[i]
			break
		}
	}
	if winterSlot == nil {
		t.Fatalf("no slot found for 2026-01-12")
	}
	wantWinterUTC := time.Date(2026, 1, 12, 14, 0, 0, 0, time.UTC) // 09:00 EST = 14:00 UTC
	if !winterSlot.Start.Equal(wantWinterUTC) {
		t.Errorf("winter slot start = %v, want %v (EST, UTC-5)", winterSlot.Start, wantWinterUTC)
	}

	// 2026-07-13 is a Monday (deep summer, EDT = UTC-4).
	summerMonday := time.Date(2026, 7, 13, 0, 0, 0, 0, ny)
	cfg.Rules = []Rule{{Weekday: summerMonday.Weekday(), StartMinute: 9 * 60, EndMinute: 9*60 + 30}}
	slots, err = AvailableSlots(cfg, now, nil)
	if err != nil {
		t.Fatalf("AvailableSlots: %v", err)
	}
	var summerSlot *Slot
	for i := range slots {
		if slots[i].Start.In(ny).Format("2006-01-02") == "2026-07-13" {
			summerSlot = &slots[i]
			break
		}
	}
	if summerSlot == nil {
		t.Fatalf("no slot found for 2026-07-13")
	}
	wantSummerUTC := time.Date(2026, 7, 13, 13, 0, 0, 0, time.UTC) // 09:00 EDT = 13:00 UTC
	if !summerSlot.Start.Equal(wantSummerUTC) {
		t.Errorf("summer slot start = %v, want %v (EDT, UTC-4)", summerSlot.Start, wantSummerUTC)
	}

	if winterSlot.Start.Hour() == summerSlot.Start.Hour() {
		// Only a meaningful assertion combined with the exact-instant checks
		// above, but stated explicitly: the whole point of this test.
		t.Errorf("winter and summer slots for the same 09:00 local rule produced the same UTC hour — DST is not being applied")
	}
}

// Directly tests the week containing the actual 2026 US spring-forward
// transition (2026-03-08): the Monday just before and the Monday just
// after must differ in UTC offset for an identical local-time rule.
func TestAvailableSlots_DST_SpringForwardTransitionWeek(t *testing.T) {
	ny := mustLoc(t, "America/New_York")
	now := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)

	beforeMonday := time.Date(2026, 3, 2, 0, 0, 0, 0, ny)  // before spring-forward (EST)
	afterMonday := time.Date(2026, 3, 9, 0, 0, 0, 0, ny)   // after spring-forward (EDT)

	get := func(day time.Time) Slot {
		cfg := Config{
			Timezone:            "America/New_York",
			DurationMinutes:     30,
			SlotIntervalMinutes: 30,
			MaxAdvanceDays:      30,
			MinNoticeMinutes:    0,
			Rules:               []Rule{{Weekday: day.Weekday(), StartMinute: 9 * 60, EndMinute: 9*60 + 30}},
		}
		slots, err := AvailableSlots(cfg, now, nil)
		if err != nil {
			t.Fatalf("AvailableSlots: %v", err)
		}
		want := day.Format("2006-01-02")
		for _, s := range slots {
			if s.Start.In(ny).Format("2006-01-02") == want {
				return s
			}
		}
		t.Fatalf("no slot found for %s", want)
		return Slot{}
	}

	before := get(beforeMonday)
	after := get(afterMonday)

	if before.Start.Hour() != 14 { // 09:00 EST = 14:00 UTC
		t.Errorf("before spring-forward: got UTC hour %d, want 14 (EST)", before.Start.Hour())
	}
	if after.Start.Hour() != 13 { // 09:00 EDT = 13:00 UTC
		t.Errorf("after spring-forward: got UTC hour %d, want 13 (EDT)", after.Start.Hour())
	}
}

// Directly tests the week containing the actual 2026 US fall-back
// transition (2026-11-01).
func TestAvailableSlots_DST_FallBackTransitionWeek(t *testing.T) {
	ny := mustLoc(t, "America/New_York")
	now := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)

	beforeMonday := time.Date(2026, 10, 26, 0, 0, 0, 0, ny) // before fall-back (EDT)
	afterMonday := time.Date(2026, 11, 2, 0, 0, 0, 0, ny)   // after fall-back (EST)

	get := func(day time.Time) Slot {
		cfg := Config{
			Timezone:            "America/New_York",
			DurationMinutes:     30,
			SlotIntervalMinutes: 30,
			MaxAdvanceDays:      30,
			MinNoticeMinutes:    0,
			Rules:               []Rule{{Weekday: day.Weekday(), StartMinute: 9 * 60, EndMinute: 9*60 + 30}},
		}
		slots, err := AvailableSlots(cfg, now, nil)
		if err != nil {
			t.Fatalf("AvailableSlots: %v", err)
		}
		want := day.Format("2006-01-02")
		for _, s := range slots {
			if s.Start.In(ny).Format("2006-01-02") == want {
				return s
			}
		}
		t.Fatalf("no slot found for %s", want)
		return Slot{}
	}

	before := get(beforeMonday)
	after := get(afterMonday)

	if before.Start.Hour() != 13 { // 09:00 EDT = 13:00 UTC
		t.Errorf("before fall-back: got UTC hour %d, want 13 (EDT)", before.Start.Hour())
	}
	if after.Start.Hour() != 14 { // 09:00 EST = 14:00 UTC
		t.Errorf("after fall-back: got UTC hour %d, want 14 (EST)", after.Start.Hour())
	}
}

func TestAvailableSlots_ExcludesBusyRanges(t *testing.T) {
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC) // a Monday
	cfg := Config{
		Timezone:            "UTC",
		DurationMinutes:     30,
		SlotIntervalMinutes: 30,
		MaxAdvanceDays:      1,
		MinNoticeMinutes:    0,
		Rules:               []Rule{{Weekday: time.Monday, StartMinute: 9 * 60, EndMinute: 11 * 60}},
	}
	// Book out 09:00-10:00 UTC — 09:30 slot should also be excluded (overlaps).
	busy := []Busy{{
		Start: time.Date(2026, 6, 1, 9, 0, 0, 0, time.UTC),
		End:   time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC),
	}}
	slots, err := AvailableSlots(cfg, now, busy)
	if err != nil {
		t.Fatalf("AvailableSlots: %v", err)
	}
	for _, s := range slots {
		if s.Start.Hour() == 9 {
			t.Errorf("expected 09:00 and 09:30 slots to be excluded by the busy range, got slot at %v", s.Start)
		}
	}
	found1030 := false
	for _, s := range slots {
		if s.Start.Equal(time.Date(2026, 6, 1, 10, 30, 0, 0, time.UTC)) {
			found1030 = true
		}
	}
	if !found1030 {
		t.Errorf("expected the 10:30 slot to remain available after the 09:00-10:00 busy range")
	}
}

func TestAvailableSlots_BufferExtendsBusyExclusion(t *testing.T) {
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	cfg := Config{
		Timezone:             "UTC",
		DurationMinutes:      30,
		SlotIntervalMinutes:  30,
		MaxAdvanceDays:       1,
		MinNoticeMinutes:     0,
		BufferBeforeMinutes:  30,
		BufferAfterMinutes:   30,
		Rules:                []Rule{{Weekday: time.Monday, StartMinute: 9 * 60, EndMinute: 12 * 60}},
	}
	busy := []Busy{{
		Start: time.Date(2026, 6, 1, 10, 0, 0, 0, time.UTC),
		End:   time.Date(2026, 6, 1, 10, 30, 0, 0, time.UTC),
	}}
	slots, err := AvailableSlots(cfg, now, busy)
	if err != nil {
		t.Fatalf("AvailableSlots: %v", err)
	}
	// With a 30-min buffer on each side, 09:30 (buffer 09:00-10:00, touches busy start)
	// and 10:30 (buffer 10:00-11:00, touches busy end) must both be excluded too.
	for _, s := range slots {
		h, m := s.Start.Hour(), s.Start.Minute()
		if (h == 9 && m == 30) || (h == 10) {
			t.Errorf("expected slot at %02d:%02d to be excluded by buffer, but it was offered", h, m)
		}
	}
}

func TestAvailableSlots_OverrideBlocksWholeDay(t *testing.T) {
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	monday := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	cfg := Config{
		Timezone:             "UTC",
		DurationMinutes:      30,
		SlotIntervalMinutes:  30,
		MaxAdvanceDays:       1,
		MinNoticeMinutes:     0,
		Rules:                []Rule{{Weekday: time.Monday, StartMinute: 9 * 60, EndMinute: 17 * 60}},
		Overrides:             []Override{{Date: monday, Blocked: true}},
	}
	slots, err := AvailableSlots(cfg, now, nil)
	if err != nil {
		t.Fatalf("AvailableSlots: %v", err)
	}
	if len(slots) != 0 {
		t.Errorf("expected 0 slots on a fully-blocked override date, got %d", len(slots))
	}
}

func TestAvailableSlots_MinNoticeExcludesTooSoonSlots(t *testing.T) {
	now := time.Date(2026, 6, 1, 8, 45, 0, 0, time.UTC) // Monday 08:45 UTC
	cfg := Config{
		Timezone:             "UTC",
		DurationMinutes:      30,
		SlotIntervalMinutes:  30,
		MaxAdvanceDays:       1,
		MinNoticeMinutes:     120, // need 2h notice -> earliest bookable is 10:45
		Rules:                []Rule{{Weekday: time.Monday, StartMinute: 9 * 60, EndMinute: 12 * 60}},
	}
	slots, err := AvailableSlots(cfg, now, nil)
	if err != nil {
		t.Fatalf("AvailableSlots: %v", err)
	}
	for _, s := range slots {
		if s.Start.Before(now.Add(2 * time.Hour)) {
			t.Errorf("slot at %v violates the 2h minimum notice from now (%v)", s.Start, now)
		}
	}
	if len(slots) == 0 {
		t.Fatalf("expected at least one slot after the notice window")
	}
}
