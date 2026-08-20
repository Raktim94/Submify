'use client';

import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MiniCalendar({
  month,
  selected,
  onSelectDate,
  onChangeMonth
}: {
  month: Date;
  selected: Date;
  onSelectDate: (date: Date) => void;
  onChangeMonth: (month: Date) => void;
}) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">{format(month, 'MMMM yyyy')}</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChangeMonth(subMonths(month, 1))}
            className="rounded-md bg-transparent p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onChangeMonth(addMonths(month, 1))}
            className="rounded-md bg-transparent p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i} className="text-[10px] font-medium text-slate-400">
            {d}
          </span>
        ))}
        {days.map((day) => (
          <button
            key={day.toISOString()}
            type="button"
            onClick={() => onSelectDate(day)}
            className={cn(
              'mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-xs transition',
              !isSameMonth(day, month) && 'text-slate-300',
              isSameDay(day, selected)
                ? 'bg-indigo-600 text-white'
                : isToday(day)
                  ? 'font-semibold text-indigo-700'
                  : 'text-slate-700 hover:bg-slate-100'
            )}
          >
            {format(day, 'd')}
          </button>
        ))}
      </div>
    </div>
  );
}
