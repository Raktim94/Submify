import type { Booking } from '@/lib/calendar';
import type { PersonalEvent, PersonalEventKind } from '@/lib/personal-events';

// A single shape the grid views render, merging the two very different
// backend concepts that share one calendar: personal_events (a user's own
// private agenda — editable) and bookings (external attendees booking an
// event type — read-only here, already managed on the Event Types tab).
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
  booking?: Booking;
};

export function buildCalendarEntries(
  personalItems: PersonalEvent[],
  bookings: Booking[],
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
