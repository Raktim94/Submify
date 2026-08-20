'use client';

import { useEffect, useRef, useState } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { calendarChipClasses, calendarDotClasses, toCalendarColor } from '@/components/ui/badge';
import type { CalendarEntry } from './entries';

const HOUR_HEIGHT = 56; // px
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

// Shared implementation behind both the Week and Day tabs — a 1-day array
// renders Day view, a 7-day array renders Week view. Kept as one component
// rather than two near-duplicates since the only real difference is how
// many day columns are passed in.
export function TimeGridView({
  days,
  entries,
  onSelectEntry,
  onCreateAt
}: {
  days: Date[];
  entries: CalendarEntry[];
  onSelectEntry: (entry: CalendarEntry) => void;
  onCreateAt: (date: Date) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstDayKey = days[0]?.toDateString();

  useEffect(() => {
    // Opens scrolled to ~7am instead of midnight — matches when most
    // events/tasks actually happen, so the grid is useful without scrolling
    // on first load.
    scrollRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT - 40 });
  }, [firstDayKey]);

  const allDayEntries = entries.filter((e) => e.allDay);
  const timedEntries = entries.filter((e) => !e.allDay);
  const gridCols = `56px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: gridCols }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className="border-l border-slate-100 px-2 py-3 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{format(d, 'EEE')}</p>
            <p
              className={cn(
                'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                isToday(d) ? 'bg-indigo-600 text-white' : 'text-slate-900'
              )}
            >
              {format(d, 'd')}
            </p>
          </div>
        ))}
      </div>

      {allDayEntries.length > 0 ? (
        <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: gridCols }}>
          <div className="px-2 py-2 text-right text-[11px] text-slate-400">All day</div>
          {days.map((d) => (
            <div key={d.toISOString()} className="space-y-1 border-l border-slate-100 p-1">
              {allDayEntries
                .filter((e) => isSameDay(e.startsAt, d))
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onSelectEntry(e)}
                    className={cn(
                      'block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-xs font-medium',
                      calendarChipClasses[toCalendarColor(e.color)]
                    )}
                  >
                    {e.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : null}

      <div ref={scrollRef} className="relative max-h-[640px] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          <div>
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-slate-100 pr-2 text-right text-[11px] text-slate-400">
                {h === 0 ? '' : format(new Date(2000, 0, 1, h), 'h a')}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayTimed = timedEntries.filter((e) => isSameDay(e.startsAt, d));
            return (
              <div key={d.toISOString()} className="relative border-l border-slate-100">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    style={{ height: HOUR_HEIGHT }}
                    className="block w-full border-b border-slate-100 bg-transparent transition hover:bg-indigo-50/40"
                    onClick={() => onCreateAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h))}
                    aria-label={`Create item on ${format(d, 'MMM d')} at ${h}:00`}
                  />
                ))}
                {dayTimed.map((e) => {
                  const startMin = minutesSinceMidnight(e.startsAt);
                  const endMin = e.endsAt ? minutesSinceMidnight(e.endsAt) : startMin + 30;
                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20);
                  return (
                    <button
                      key={e.id}
                      onClick={() => onSelectEntry(e)}
                      style={{ top, height }}
                      className={cn(
                        'absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-xs font-medium shadow-sm',
                        calendarChipClasses[toCalendarColor(e.color)],
                        e.isCompleted && 'opacity-50 line-through'
                      )}
                    >
                      <span className="flex items-center gap-1">
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', calendarDotClasses[toCalendarColor(e.color)])} aria-hidden />
                        <span className="truncate">{e.title}</span>
                      </span>
                    </button>
                  );
                })}
                {isToday(d) ? <CurrentTimeLine /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CurrentTimeLine() {
  const [top, setTop] = useState(() => (minutesSinceMidnight(new Date()) / 60) * HOUR_HEIGHT);
  useEffect(() => {
    const id = setInterval(() => setTop((minutesSinceMidnight(new Date()) / 60) * HOUR_HEIGHT), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="pointer-events-none absolute left-0 right-0 z-10 flex items-center gap-0.5" style={{ top }}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
      <span className="h-px flex-1 bg-rose-500" aria-hidden />
    </div>
  );
}
