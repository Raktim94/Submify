'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { type PublicEventType, type PublicSlot, createPublicBooking, getPublicEventType, getPublicSlots } from '@/lib/calendar';

type Step = 'loading' | 'error' | 'pick-time' | 'details' | 'confirmed';

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function PublicBookingPage() {
  const params = useParams<{ eventTypeId: string }>();
  const eventTypeId = params.eventTypeId;

  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState('');
  const [eventType, setEventType] = useState<PublicEventType | null>(null);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [manageToken, setManageToken] = useState('');

  useEffect(() => {
    if (!eventTypeId) return;
    Promise.all([getPublicEventType(eventTypeId), getPublicSlots(eventTypeId)])
      .then(([et, s]) => {
        setEventType(et);
        setSlots(s.slots);
        setStep('pick-time');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'This booking page could not be loaded.');
        setStep('error');
      });
  }, [eventTypeId]);

  const dateGroups = useMemo(() => {
    const groups = new Map<string, PublicSlot[]>();
    for (const s of slots) {
      const key = dateKey(s.start);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return groups;
  }, [slots]);

  const sortedDates = useMemo(() => Array.from(dateGroups.keys()), [dateGroups]);

  useEffect(() => {
    if (!selectedDate && sortedDates.length > 0) setSelectedDate(sortedDates[0]);
  }, [sortedDates, selectedDate]);

  async function submitBooking(e: FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !eventTypeId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await createPublicBooking(eventTypeId, {
        starts_at: selectedSlot.start,
        attendee_name: name.trim(),
        attendee_email: email.trim(),
        attendee_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes: notes.trim()
      });
      setManageToken(res.booking.manage_token ?? '');
      setStep('confirmed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That time may have just been booked — please pick another.');
      // Refresh slots so the taken time disappears from the list.
      if (eventTypeId) {
        getPublicSlots(eventTypeId)
          .then((s) => setSlots(s.slots))
          .catch(() => {});
      }
      setStep('pick-time');
      setSelectedSlot(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {step === 'loading' ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-500">Loading…</p>
            </CardBody>
          </Card>
        ) : step === 'error' ? (
          <Card>
            <CardBody>
              <Alert variant="error">{error}</Alert>
            </CardBody>
          </Card>
        ) : null}

        {eventType && step !== 'loading' && step !== 'error' ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="font-display text-2xl font-bold text-slate-900">{eventType.title}</h1>
              <p className="mt-1 text-sm text-slate-600">
                {eventType.duration_minutes} minutes{eventType.location ? ` · ${eventType.location}` : ''}
              </p>
              {eventType.description ? <p className="mx-auto mt-3 max-w-lg text-sm text-slate-600">{eventType.description}</p> : null}
            </div>

            {step === 'pick-time' ? (
              <Card>
                <CardBody>
                  {error ? <Alert variant="error">{error}</Alert> : null}
                  {sortedDates.length === 0 ? (
                    <p className="text-sm text-slate-500">No times are currently available — please check back soon.</p>
                  ) : (
                    <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
                      <div className="flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
                        {sortedDates.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setSelectedDate(d)}
                            className={`shrink-0 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                              selectedDate === d
                                ? 'bg-brand-500 text-white shadow-md shadow-indigo-500/25'
                                : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50'
                            }`}
                          >
                            {new Date(dateGroups.get(d)![0].start).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </button>
                        ))}
                      </div>
                      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                        {(selectedDate ? dateGroups.get(selectedDate) ?? [] : []).map((s) => (
                          <button
                            key={s.start}
                            type="button"
                            onClick={() => {
                              setSelectedSlot(s);
                              setStep('details');
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50"
                          >
                            {new Date(s.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            ) : null}

            {step === 'details' && selectedSlot ? (
              <Card>
                <CardBody>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setStep('pick-time')} className="mb-4 -ml-2">
                    ← Choose a different time
                  </Button>
                  <p className="mb-4 rounded-xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900">
                    {new Date(selectedSlot.start).toLocaleString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                  {error ? (
                    <Alert variant="error" className="mb-4">
                      {error}
                    </Alert>
                  ) : null}
                  <form onSubmit={submitBooking} className="space-y-4">
                    <Field label="Your name">
                      <Input value={name} onChange={(e) => setName(e.target.value)} required />
                    </Field>
                    <Field label="Email">
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </Field>
                    <Field label="Anything you'd like to share? (optional)">
                      <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </Field>
                    <Button type="submit" loading={submitting} className="w-full">
                      Confirm booking
                    </Button>
                  </form>
                </CardBody>
              </Card>
            ) : null}

            {step === 'confirmed' && selectedSlot ? (
              <Card>
                <CardBody className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    ✓
                  </div>
                  <h2 className="font-display text-xl font-bold text-slate-900">You&apos;re booked</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {new Date(selectedSlot.start).toLocaleString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                  <p className="mt-4 text-sm text-slate-500">Save this page&apos;s link if you&apos;d like to reschedule or cancel later.</p>
                  {manageToken ? (
                    <a href={`/book/manage/${manageToken}`} className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">
                      Need to reschedule or cancel?
                    </a>
                  ) : null}
                </CardBody>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
