import type { PersonalEvent, PersonalEventKind } from '@/lib/personal-events';

// Structural shape both the dashboard's full `Booking` (lib/calendar.ts) and
// the client portal's minimized `PortalBooking` (lib/portal.ts) satisfy —
// the grid/dialog components below render off this, not either concrete
// type, so they don't assume a full JWT-authenticated org member is calling.
// attendee_email/notes are optional because the portal deliberately never
// receives them (see docs/decisions/0010-portal-calendar-read-only.md).
export type BookingLike = {
  id: string;
  event_type_id: string;
  starts_at: string;
  ends_at: string;
  attendee_name: string;
  attendee_email?: string;
  notes?: string;
  location?: string;
  status: string;
};

// A single shape the grid views render, merging the two very different
// backend concepts that share one calendar: personal_events (a user's own
// private agenda — editable, dashboard-only, never sent to the portal) and
// bookings (external attendees booking an event type — read-only here,
// already managed on the Event Types tab in the dashboard).
export type CalendarEntry = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  color: string;
  source: 'booking' | 'personal';
  kind: PersonalEventKind | 'booking';
  isCompleted?: boolean;
  personalEvent?: PersonalEvent;
  booking?: BookingLike;
};

export function buildCalendarEntries(
  personalItems: PersonalEvent[],
  bookings: BookingLike[],
  eventTypeTitleById: Record<string, string>
): CalendarEntry[] {
  const fromPersonal: CalendarEntry[] = personalItems.map((p) => ({
    id: `personal:${p.id}`,
    title: p.title,
    startsAt: new Date(p.starts_at),
    endsAt: p.ends_at ? new Date(p.ends_at) : null,
    allDay: p.all_day,
    color: p.color,
    source: 'personal',
    kind: p.kind,
    isCompleted: p.is_completed,
    personalEvent: p
  }));
  const fromBookings: CalendarEntry[] = bookings
    .filter((b) => b.status === 'confirmed')
    .map((b) => ({
      id: `booking:${b.id}`,
      title: `${eventTypeTitleById[b.event_type_id] ?? 'Booking'} — ${b.attendee_name}`,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
      allDay: false,
      color: 'sky',
      source: 'booking',
      kind: 'booking',
      booking: b
    }));
  return [...fromPersonal, ...fromBookings];
}
