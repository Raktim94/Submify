'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardBody } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  type AvailabilityRule,
  type Booking,
  type EventType,
  cancelOrgBooking,
  createEventType,
  deleteEventType,
  listEventTypes,
  listOrgBookings
} from '@/lib/calendar';

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function NewEventTypeForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [minNotice, setMinNotice] = useState(60);
  const [maxAdvance, setMaxAdvance] = useState(30);
  const [days, setDays] = useState<Record<number, { enabled: boolean; start: string; end: string }>>(() => {
    const base: Record<number, { enabled: boolean; start: string; end: string }> = {};
    for (const d of WEEKDAYS) base[d.value] = { enabled: d.value >= 1 && d.value <= 5, start: '09:00', end: '17:00' };
    return base;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    const rules: AvailabilityRule[] = WEEKDAYS.filter((d) => days[d.value].enabled).map((d) => ({
      weekday: d.value,
      start_minute: timeToMinutes(days[d.value].start),
      end_minute: timeToMinutes(days[d.value].end)
    }));
    if (rules.length === 0) {
      setError('Pick at least one available day.');
      return;
    }
    setBusy(true);
    try {
      await createEventType({
        project_id: projectId,
        slug: slugify(title) || 'event',
        title: title.trim(),
        description: description.trim(),
        duration_minutes: duration,
        location: location.trim(),
        timezone,
        min_notice_minutes: minNotice,
        max_advance_days: maxAdvance,
        rules
      });
      setTitle('');
      setDescription('');
      setLocation('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create event type.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="30-Minute Consultation" required />
        </Field>
        <Field label="Duration (minutes)">
          <Input type="number" min={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location" hint="e.g. Google Meet, phone number, or an address">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Google Meet" />
        </Field>
        <Field label="Timezone" hint="Detected from your browser">
          <Input value={timezone} disabled />
        </Field>
      </div>
      <Field label="Description">
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum notice (minutes)">
          <Input type="number" min={0} value={minNotice} onChange={(e) => setMinNotice(Number(e.target.value))} />
        </Field>
        <Field label="Bookable up to (days ahead)">
          <Input type="number" min={1} value={maxAdvance} onChange={(e) => setMaxAdvance(Number(e.target.value))} />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Weekly availability</p>
        <div className="space-y-2">
          {WEEKDAYS.map((d) => {
            const cfg = days[d.value];
            return (
              <div key={d.value} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                <label className="flex w-24 shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => setDays((prev) => ({ ...prev, [d.value]: { ...prev[d.value], enabled: e.target.checked } }))}
                  />
                  {d.label}
                </label>
                {cfg.enabled ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={cfg.start}
                      onChange={(e) => setDays((prev) => ({ ...prev, [d.value]: { ...prev[d.value], start: e.target.value } }))}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="time"
                      value={cfg.end}
                      onChange={(e) => setDays((prev) => ({ ...prev, [d.value]: { ...prev[d.value], end: e.target.value } }))}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Unavailable</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Button type="submit" loading={busy}>
        Create event type
      </Button>
    </form>
  );
}

export function EventTypesPanel({ projectId, initialShowForm = false }: { projectId: string; initialShowForm?: boolean }) {
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(initialShowForm);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Booking | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [et, b] = await Promise.all([listEventTypes(projectId), listOrgBookings(projectId)]);
      setEventTypes(et.event_types);
      setBookings(b.bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load calendar data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [projectId]);

  const upcoming = useMemo(
    () => bookings.filter((b) => b.status === 'confirmed').sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    [bookings]
  );
  const eventTypeById = useMemo(() => Object.fromEntries(eventTypes.map((e) => [e.id, e])), [eventTypes]);

  async function copyLink(id: string) {
    await navigator.clipboard.writeText(`${origin}/book/${id}`);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  async function removeEventType(id: string) {
    await deleteEventType(id);
    load();
  }

  async function confirmCancel() {
    if (!pendingCancel) return;
    await cancelOrgBooking(pendingCancel.id);
    setPendingCancel(null);
    load();
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Booking pages your organization can share, and upcoming appointments.</p>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'New event type'}</Button>
      </div>

      {error ? (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      ) : null}

      {showForm ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New event type</CardTitle>
            <CardDescription>Set a duration and weekly hours — a shareable booking link is generated automatically.</CardDescription>
          </CardHeader>
          <CardBody>
            <NewEventTypeForm
              projectId={projectId}
              onCreated={() => {
                setShowForm(false);
                load();
              }}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Event types</CardTitle>
          <CardDescription>Each has its own shareable public booking link.</CardDescription>
        </CardHeader>
        <CardBody>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : eventTypes.length === 0 ? (
            <p className="text-sm text-slate-500">No event types yet — create one to start taking bookings.</p>
          ) : (
            <div className="space-y-3">
              {eventTypes.map((et) => (
                <div key={et.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{et.title}</p>
                    <p className="text-sm text-slate-500">
                      {et.duration_minutes} min · {et.timezone}
                      {et.location ? ` · ${et.location}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyLink(et.id)}>
                      {copiedId === et.id ? 'Copied!' : 'Copy booking link'}
                    </Button>
                    <a href={`/book/${et.id}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-indigo-600 hover:underline">
                      Preview
                    </a>
                    <Button variant="danger" size="sm" onClick={() => removeEventType(et.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming bookings</CardTitle>
          <CardDescription>Next 30 days.</CardDescription>
        </CardHeader>
        <CardBody>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming bookings.</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{formatDateTime(b.starts_at)}</p>
                    <p className="text-sm text-slate-500">
                      {b.attendee_name} ({b.attendee_email}) · {eventTypeById[b.event_type_id]?.title ?? 'Event'}
                    </p>
                    {b.notes ? <p className="mt-1 text-sm text-slate-600">&ldquo;{b.notes}&rdquo;</p> : null}
                  </div>
                  <Button variant="danger" size="sm" onClick={() => setPendingCancel(b)}>
                    Cancel
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pendingCancel !== null}
        title="Cancel this booking?"
        description={pendingCancel ? `${pendingCancel.attendee_name} will no longer be booked for this time.` : ''}
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        danger
        onConfirm={confirmCancel}
        onCancel={() => setPendingCancel(null)}
      />
    </>
  );
}
