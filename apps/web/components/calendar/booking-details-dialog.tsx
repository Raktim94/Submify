'use client';

import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { BookingLike } from './entries';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Read-only in both places it's used — on the dashboard, bookings (external
// attendees) are managed on the Event Types tab's "Upcoming bookings" list
// (reschedule/cancel already live there); on the client portal, the viewer
// has no management ability at all (see
// docs/decisions/0010-portal-calendar-read-only.md). This is just a quick
// "what is this" view for a chip clicked on the grid. `booking` is typed as
// `BookingLike`, not the dashboard's full `Booking`, so it also renders the
// portal's PII-minimized booking shape (no attendee_email/notes) without a
// separate dialog component.
export function BookingDetailsDialog({
  booking,
  eventTypeTitle,
  manageHint = "Manage reschedule/cancel from the Event Types tab's upcoming bookings list.",
  onClose
}: {
  booking: BookingLike | null;
  eventTypeTitle?: string;
  manageHint?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={booking !== null} onClose={onClose} title={eventTypeTitle ?? 'Booking'}>
      {booking ? (
        <div className="space-y-3 text-sm">
          <Badge color="sky">Booking</Badge>
          <p className="font-medium text-slate-900">{formatDateTime(booking.starts_at)}</p>
          <p className="text-slate-600">{booking.attendee_email ? `${booking.attendee_name} (${booking.attendee_email})` : booking.attendee_name}</p>
          {booking.location ? <p className="text-slate-600">{booking.location}</p> : null}
          {booking.notes ? <p className="whitespace-pre-line text-slate-600">&ldquo;{booking.notes}&rdquo;</p> : null}
          <p className="text-xs text-slate-400">{manageHint}</p>
        </div>
      ) : null}
    </Dialog>
  );
}
