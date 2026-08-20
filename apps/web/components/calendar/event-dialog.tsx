'use client';

import { FormEvent, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { CALENDAR_COLORS, calendarDotClasses, toCalendarColor } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  createPersonalEvent,
  deletePersonalEvent,
  updatePersonalEvent,
  type PersonalEvent,
  type PersonalEventKind
} from '@/lib/personal-events';

const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At the time' },
  { value: '5', label: '5 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' }
];

function toDateInput(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}
function toTimeInput(d: Date): string {
  return format(d, 'HH:mm');
}
function combine(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr || '00:00'}:00`);
}
function minutesBefore(start: Date, minutes: number): Date {
  return new Date(start.getTime() - minutes * 60_000);
}

export type EventDialogProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (item: PersonalEvent) => void;
  onDeleted?: (id: string) => void;
  /** Present = editing this item. Absent = creating a new one. */
  item?: PersonalEvent | null;
  /** Create-mode only: default kind/date for a fresh item. */
  kind?: PersonalEventKind;
  initialDate?: Date;
};

// Combined view/edit/create/delete dialog for a personal calendar item —
// deliberately one component rather than splitting create vs. edit, since
// both share the exact same field set and only differ in which API call
// fires on submit.
export function EventDialog({ open, onClose, onSaved, onDeleted, item, kind: initialKind, initialDate }: EventDialogProps) {
  const isEditing = Boolean(item);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<PersonalEventKind>('event');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState<string>('indigo');
  const [reminderMinutes, setReminderMinutes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Re-seed form state whenever the dialog opens (edit an existing item, or
  // start a fresh create) rather than trying to reset individual fields —
  // see this machine's own conditional-mount convention for dialogs that
  // need a clean slate on open.
  useEffect(() => {
    if (!open) return;
    setError('');
    setConfirmingDelete(false);
    if (item) {
      const starts = new Date(item.starts_at);
      const ends = item.ends_at ? new Date(item.ends_at) : null;
      setTitle(item.title);
      setDescription(item.description);
      setKind(item.kind);
      setDate(toDateInput(starts));
      setStartTime(toTimeInput(starts));
      setEndTime(ends ? toTimeInput(ends) : toTimeInput(new Date(starts.getTime() + 60 * 60_000)));
      setAllDay(item.all_day);
      setColor(item.color);
      if (item.remind_at) {
        const diffMin = Math.round((starts.getTime() - new Date(item.remind_at).getTime()) / 60_000);
        const match = REMINDER_OPTIONS.find((o) => o.value === String(Math.max(diffMin, 0)));
        setReminderMinutes(match ? match.value : '0');
      } else {
        setReminderMinutes('');
      }
    } else {
      const base = initialDate ?? new Date();
      setTitle('');
      setDescription('');
      setKind(initialKind ?? 'event');
      setDate(toDateInput(base));
      setStartTime('09:00');
      setEndTime('10:00');
      setAllDay(false);
      setColor('indigo');
      setReminderMinutes(initialKind === 'reminder' ? '0' : '');
    }
  }, [open, item, initialKind, initialDate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const startsAt = allDay ? combine(date, '00:00') : combine(date, startTime);
      const endsAt = kind === 'event' && !allDay ? combine(date, endTime) : null;
      const remindAt = reminderMinutes !== '' ? minutesBefore(startsAt, Number(reminderMinutes)) : null;

      if (item) {
        const { item: updated } = await updatePersonalEvent(item.id, {
          title: title.trim(),
          description,
          kind,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt ? endsAt.toISOString() : '',
          all_day: allDay,
          color,
          remind_at: remindAt ? remindAt.toISOString() : ''
        });
        onSaved(updated);
      } else {
        const { item: created } = await createPersonalEvent({
          title: title.trim(),
          description,
          kind,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt ? endsAt.toISOString() : null,
          all_day: allDay,
          color,
          remind_at: remindAt ? remindAt.toISOString() : null
        });
        onSaved(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item || deleting) return;
    setDeleting(true);
    try {
      await deletePersonalEvent(item.id);
      onDeleted?.(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open && !confirmingDelete} onClose={onClose} title={isEditing ? 'Edit item' : 'New calendar item'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert variant="error">{error}</Alert> : null}

          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's this about?" autoFocus />
          </Field>

          <Field label="Type">
            <div className="inline-flex flex-wrap gap-1.5">
              {(['event', 'task', 'reminder'] as PersonalEventKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition',
                    kind === k
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            {kind === 'event' ? (
              <div className="flex items-end pb-2.5">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                  />
                  All day
                </label>
              </div>
            ) : null}
          </div>

          {!allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={kind === 'event' ? 'Start time' : 'Time'}>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </Field>
              {kind === 'event' ? (
                <Field label="End time">
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </Field>
              ) : null}
            </div>
          ) : null}

          <Field label="Reminder" hint="Sends a Telegram notification at the chosen time (requires Telegram configured in Settings).">
            <Select value={reminderMinutes} onChange={(e) => setReminderMinutes(e.target.value)}>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Color">
            <div className="flex gap-2">
              {CALENDAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full transition',
                    calendarDotClasses[toCalendarColor(c)],
                    color === c ? 'ring-2 ring-offset-2 ring-slate-900' : 'opacity-70 hover:opacity-100'
                  )}
                />
              ))}
            </div>
          </Field>

          <Field label="Notes (optional)">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="flex items-center justify-between pt-2">
            {isEditing ? (
              <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(true)} className="text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {isEditing ? 'Save changes' : 'Create'}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this item?"
        description={item ? `"${item.title}" will be permanently removed.` : undefined}
        danger
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
