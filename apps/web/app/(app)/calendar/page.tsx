'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Field, Select } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { api } from '@/lib/api';
import { MonthView } from '@/components/calendar/month-view';
import { TimeGridView } from '@/components/calendar/time-grid-view';
import { MiniCalendar } from '@/components/calendar/mini-calendar';
import { EventDialog } from '@/components/calendar/event-dialog';
import { BookingDetailsDialog } from '@/components/calendar/booking-details-dialog';
import { EventTypesPanel } from '@/components/calendar/event-types-panel';
import { buildCalendarEntries, type BookingLike, type CalendarEntry } from '@/components/calendar/entries';
import { listEventTypes, listOrgBookings, type Booking, type EventType } from '@/lib/calendar';
import { listPersonalEvents, type PersonalEvent, type PersonalEventKind } from '@/lib/personal-events';

type GridView = 'month' | 'week' | 'day';
type CalendarTab = 'grid' | 'event-types';
type Project = { id: string; name: string };

type DialogState = { mode: 'create'; kind: PersonalEventKind; date: Date } | { mode: 'edit'; item: PersonalEvent } | null;

// Always normalized to local midnight — Day view's range is computed as
// [date, date+1day), so a non-midnight `date` (the bare `new Date()`
// fallback below returns "right now", e.g. 10:18am) would silently exclude
// anything earlier in the day. Confirmed live: a 9am task disappeared from
// Day view specifically (Month/Week were unaffected, since startOfMonth/
// startOfWeek already normalize) whenever no `date` param was in the URL.
function parseDateParam(v: string | null): Date {
  if (v) {
    const d = new Date(`${v}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return startOfDay(d);
  }
  return startOfDay(new Date());
}

// useSearchParams needs a Suspense boundary or Next.js deopts the whole
// page to client rendering during the build — see Next's own
// app/03-api-reference/04-functions/use-search-params.md.
export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab: CalendarTab = searchParams.get('tab') === 'event-types' ? 'event-types' : 'grid';
  const rawView = searchParams.get('view');
  const view: GridView = rawView === 'week' || rawView === 'day' ? rawView : 'month';
  // Memoized on the raw string param, not recomputed as a fresh Date every
  // render — parseDateParam(...) returns a new object identity each call,
  // which would otherwise break the range/load useMemo/useCallback chain
  // below (new Date every render -> range "changes" every render -> load
  // callback recreated every render -> its useEffect re-fires every render
  // -> infinite refetch loop). Confirmed live via Playwright: without this,
  // /calendar/items and /bookings got hammered until the rate limiter
  // kicked in with 429s.
  const dateParam = searchParams.get('date');
  const date = useMemo(() => parseDateParam(dateParam), [dateParam]);

  const setParams = useCallback(
    (next: { tab?: CalendarTab; view?: GridView; date?: Date; project?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.tab) params.set('tab', next.tab);
      if (next.view) params.set('view', next.view);
      if (next.date) params.set('date', format(next.date, 'yyyy-MM-dd'));
      if (next.project) params.set('project', next.project);
      router.replace(`/calendar?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Every project has its own, separate calendar — event types, bookings,
  // and personal agenda items are all scoped server-side by project_id
  // (see docs/decisions/0011-project-scoped-calendar.md). This dropdown
  // picks which project's calendar the grid/event-types tabs show and
  // where a newly created event/event-type lands, mirroring the project
  // picker already used on /export. Persisted in the URL (?project=) like
  // the other view state on this page.
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(() => searchParams.get('project') ?? '');
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects')
      .then((data) => {
        setProjects(data.projects);
        setProjectId((current) => {
          if (current && data.projects.some((p) => p.id === current)) return current;
          return data.projects[0]?.id ?? '';
        });
      })
      .catch(() => {
        /* surfaced via the empty-projects/error states below once loaded */
      })
      .finally(() => setProjectsLoaded(true));
  }, []);

  function selectProject(id: string) {
    setProjectId(id);
    setParams({ project: id });
  }

  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [personalItems, setPersonalItems] = useState<PersonalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [bookingDialog, setBookingDialog] = useState<BookingLike | null>(null);

  const range = useMemo(() => {
    if (view === 'month') return { from: startOfWeek(startOfMonth(date)), to: endOfWeek(endOfMonth(date)) };
    if (view === 'week') return { from: startOfWeek(date), to: endOfWeek(date) };
    return { from: date, to: addDays(date, 1) };
  }, [view, date]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [et, b, pe] = await Promise.all([
        listEventTypes(projectId),
        listOrgBookings(projectId, range.from.toISOString(), range.to.toISOString()),
        listPersonalEvents(projectId, range.from.toISOString(), range.to.toISOString())
      ]);
      setEventTypes(et.event_types);
      setBookings(b.bookings);
      setPersonalItems(pe.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load calendar data.');
    } finally {
      setLoading(false);
    }
  }, [projectId, range.from, range.to]);

  useEffect(() => {
    if (tab === 'grid' && projectId) load();
  }, [tab, projectId, load]);

  const eventTypeTitleById = useMemo(() => Object.fromEntries(eventTypes.map((e) => [e.id, e.title])), [eventTypes]);
  const entries: CalendarEntry[] = useMemo(
    () => buildCalendarEntries(personalItems, bookings, eventTypeTitleById),
    [personalItems, bookings, eventTypeTitleById]
  );

  function goToday() {
    setParams({ date: new Date() });
  }
  function goPrev() {
    if (view === 'month') setParams({ date: subMonths(date, 1) });
    else if (view === 'week') setParams({ date: subWeeks(date, 1) });
    else setParams({ date: addDays(date, -1) });
  }
  function goNext() {
    if (view === 'month') setParams({ date: addMonths(date, 1) });
    else if (view === 'week') setParams({ date: addWeeks(date, 1) });
    else setParams({ date: addDays(date, 1) });
  }

  function selectEntry(entry: CalendarEntry) {
    if (entry.source === 'personal' && entry.personalEvent) {
      setDialogState({ mode: 'edit', item: entry.personalEvent });
    } else if (entry.booking) {
      setBookingDialog(entry.booking);
    }
  }

  const gridDays = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)) : [date];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="mt-1 text-sm text-slate-600">Your agenda, bookings, and shareable booking links — all in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {projects.length > 1 ? (
            <div className="w-56">
              <Field label="Calendar" htmlFor="calendar-project">
                <Select id="calendar-project" value={projectId} onChange={(e) => selectProject(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          <Tabs
            value={tab}
            onChange={(v) => setParams({ tab: v as CalendarTab })}
            items={[
              { value: 'grid', label: 'Calendar' },
              { value: 'event-types', label: 'Event Types' }
            ]}
          />
        </div>
      </div>

      {projectsLoaded && projects.length === 0 ? (
        <Alert variant="info" className="text-center">
          <p className="font-medium">No projects found.</p>
          <p className="mt-2 text-sm">Create a project first — every project gets its own calendar.</p>
        </Alert>
      ) : tab === 'event-types' ? (
        <EventTypesPanel projectId={projectId} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={goToday}>
                  Today
                </Button>
                <button type="button" onClick={goPrev} className="rounded-lg bg-transparent p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Previous">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={goNext} className="rounded-lg bg-transparent p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Next">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
                <p className="ml-2 text-base font-semibold text-slate-900">
                  {view === 'month'
                    ? format(date, 'MMMM yyyy')
                    : view === 'week'
                      ? `Week of ${format(startOfWeek(date), 'MMM d')}`
                      : format(date, 'EEEE, MMM d')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Tabs
                  value={view}
                  onChange={(v) => setParams({ view: v as GridView })}
                  items={[
                    { value: 'month', label: 'Month' },
                    { value: 'week', label: 'Week' },
                    { value: 'day', label: 'Day' }
                  ]}
                />
                <Button size="sm" disabled={!projectId} onClick={() => setDialogState({ mode: 'create', kind: 'event', date })}>
                  <Plus className="h-4 w-4" aria-hidden /> New
                </Button>
              </div>
            </div>

            {error ? (
              <Alert variant="error" className="mb-4">
                {error}
              </Alert>
            ) : null}

            {loading ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center text-sm text-slate-500">
                Loading calendar…
              </div>
            ) : view === 'month' ? (
              <MonthView
                month={date}
                entries={entries}
                onSelectDay={(d) => setParams({ date: d, view: 'day' })}
                onSelectEntry={selectEntry}
                onCreateAt={(d) => setDialogState({ mode: 'create', kind: 'event', date: d })}
              />
            ) : (
              <TimeGridView
                days={gridDays}
                entries={entries}
                onSelectEntry={selectEntry}
                onCreateAt={(d) => setDialogState({ mode: 'create', kind: 'event', date: d })}
              />
            )}
          </div>

          <div className="order-first lg:order-last">
            <MiniCalendar
              month={date}
              selected={date}
              onSelectDate={(d) => setParams({ date: d, view: 'day' })}
              onChangeMonth={(m) => setParams({ date: m })}
            />
          </div>
        </div>
      )}

      <EventDialog
        open={dialogState !== null}
        projectId={projectId}
        item={dialogState?.mode === 'edit' ? dialogState.item : null}
        kind={dialogState?.mode === 'create' ? dialogState.kind : undefined}
        initialDate={dialogState?.mode === 'create' ? dialogState.date : undefined}
        onClose={() => setDialogState(null)}
        onSaved={() => {
          setDialogState(null);
          load();
        }}
        onDeleted={() => {
          setDialogState(null);
          load();
        }}
      />

      <BookingDetailsDialog
        booking={bookingDialog}
        eventTypeTitle={bookingDialog ? eventTypeTitleById[bookingDialog.event_type_id] : undefined}
        onClose={() => setBookingDialog(null)}
      />
    </div>
  );
}
