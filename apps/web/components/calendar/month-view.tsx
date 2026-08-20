'use client';

import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { calendarChipClasses, calendarDotClasses, toCalendarColor } from '@/components/ui/badge';
import type { CalendarEntry } from './entries';

const MAX_CHIPS_PER_DAY = 3;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({
  month,
  entries,
  onSelectDay,
  onSelectEntry,
  onCreateAt
}: {
  month: Date;
  entries: CalendarEntry[];
  onSelectDay: (date: Date) => void;
  onSelectEntry: (entry: CalendarEntry) => void;
  onCreateAt: (date: Date) => void;
}) {
  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEntries = entries
            .filter((e) => isSameDay(e.startsAt, day))
            .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
          const inMonth = isSameMonth(day, month);
          const visible = dayEntries.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = dayEntries.length - visible.length;

          return (
            <div
              key={day.toISOString()}
              className={cn('group relative min-h-[104px] border-b border-r border-slate-100 p-1.5', !inMonth && 'bg-slate-50/60')}
            >
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={cn(
                    // bg-transparent is load-bearing, not decorative: globals.css has an
                    // unscoped `button { bg-brand-500; color: white }` reset, so any raw
                    // <button> branch that doesn't set its own bg-*/text-* falls through to
                    // solid purple — bit this exact project once before (see git history on
                    // the booking pages). Every branch below sets an explicit color now.
                    'flex h-6 w-6 items-center justify-center rounded-full bg-transparent text-xs font-semibold transition hover:bg-indigo-100',
                    isToday(day) ? 'bg-indigo-600 text-white hover:bg-indigo-600' : inMonth ? 'text-slate-800' : 'text-slate-400'
                  )}
                >
                  {format(day, 'd')}
                </button>
                <button
                  type="button"
                  onClick={() => onCreateAt(day)}
                  className="rounded-md bg-transparent px-1 text-xs text-slate-300 opacity-0 transition hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"
                  aria-label={`Add item on ${format(day, 'MMM d')}`}
                >
                  +
                </button>
              </div>
              <div className="space-y-1">
                {visible.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onSelectEntry(e)}
                    className={cn(
                      'flex w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium',
                      calendarChipClasses[toCalendarColor(e.color)],
                      e.isCompleted && 'opacity-50 line-through'
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', calendarDotClasses[toCalendarColor(e.color)])} aria-hidden />
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
                {overflow > 0 ? (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="bg-transparent text-[11px] font-medium text-slate-500 hover:text-indigo-700"
                  >
                    +{overflow} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
