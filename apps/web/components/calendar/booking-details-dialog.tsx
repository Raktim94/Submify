'use client';

import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { Booking } from '@/lib/calendar';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Read-only — bookings (external attendees) are managed on the Event Types
// tab's "Upcoming bookings" list (reschedule/cancel already live there);
// this is just a quick "what is this" view for a chip clicked on the grid.
export function BookingDetailsDialog({
  booking,
  eventTypeTitle,
  onClose
}: {
  booking: Booking | null;
  eventTypeTitle?: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={booking !== null} onClose={onClose} title={eventTypeTitle ?? 'Booking'}>
      {booking ? (
        <div className="space-y-3 text-sm">
          <Badge color="sky">Booking</Badge>
          <p className="font-medium text-slate-900">{formatDateTime(booking.starts_at)}</p>
          <p className="text-slate-600">
            {booking.attendee_name} ({booking.attendee_email})
          </p>
          {booking.notes ? <p className="whitespace-pre-line text-slate-600">&ldquo;{booking.notes}&rdquo;</p> : null}
          <p className="text-xs text-slate-400">Manage reschedule/cancel from the Event Types tab&apos;s upcoming bookings list.</p>
        </div>
      ) : null}
    </Dialog>
  );
}
