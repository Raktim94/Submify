'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiBase } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  type Booking,
  type PublicSlot,
  cancelPublicBooking,
  getPublicBooking,
  getPublicEventType,
  getPublicSlots,
  reschedulePublicBooking
} from '@/lib/calendar';

export default function ManageBookingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [rescheduling, setRescheduling] = useState(false);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { booking: b } = await getPublicBooking(token);
      setBooking(b);
      try {
        const et = await getPublicEventType(b.event_type_id);
        setEventTitle(et.title);
      } catch {
        /* non-fatal */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This booking could not be found.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function startReschedule() {
    if (!booking) return;
    setRescheduling(true);
    try {
      const s = await getPublicSlots(booking.event_type_id);
      setSlots(s.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load available times.');
    }
  }

  async function pickNewTime(slot: PublicSlot) {
    setBusy(true);
    setError('');
    try {
      const { booking: updated } = await reschedulePublicBooking(token, slot.start);
      setBooking(updated);
      setRescheduling(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That time may have just been taken — pick another.');
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    setBusy(true);
    try {
      const { booking: updated } = await cancelPublicBooking(token);
      setBooking(updated);
      setConfirmCancel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel this booking.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Card>
          <CardBody>
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : !booking ? (
              <Alert variant="error">{error || 'This booking could not be found.'}</Alert>
            ) : (
              <>
                <h1 className="font-display text-xl font-bold text-slate-900">{eventTitle || 'Your booking'}</h1>

                {error ? (
                  <Alert variant="error" className="mt-4">
                    {error}
                  </Alert>
                ) : null}

                {booking.status === 'cancelled' ? (
                  <Alert variant="info" className="mt-4">
                    This booking was cancelled.
                  </Alert>
                ) : (
                  <p className="mt-3 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900">
                    {new Date(booking.starts_at).toLocaleString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                )}

                <p className="mt-3 text-sm text-slate-600">
                  {booking.attendee_name} &middot; {booking.attendee_email}
                </p>

                {booking.status === 'confirmed' && !rescheduling ? (
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button variant="outline" onClick={startReschedule}>
                      Reschedule
                    </Button>
                    <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                      Cancel booking
                    </Button>
                    <a href={`${apiBase()}/public/bookings/${token}/ics`} className="text-sm font-medium text-indigo-600 hover:underline">
                      Add to calendar
                    </a>
                  </div>
                ) : null}

                {rescheduling ? (
                  <div className="mt-6">
                    <p className="mb-3 text-sm font-medium text-slate-700">Pick a new time</p>
                    <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                      {slots.map((s) => (
                        <button
                          key={s.start}
                          type="button"
                          disabled={busy}
                          onClick={() => pickNewTime(s)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {new Date(s.start).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </button>
                      ))}
                    </div>
                    <Button variant="ghost" size="sm" className="mt-3" onClick={() => setRescheduling(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this booking?"
        description="This can't be undone — you'll need to book a new time if you change your mind."
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        danger
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </main>
  );
}
