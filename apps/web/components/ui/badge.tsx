import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// The fixed color palette a personal-event's `color` field is chosen from
// (see components/calendar/event-dialog.tsx) — kept small and named so a
// calendar chip's color always maps to a real, tested Tailwind class
// instead of interpolating an arbitrary string into a class name.
export const CALENDAR_COLORS = ['indigo', 'violet', 'emerald', 'amber', 'rose', 'sky'] as const;
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

const colorClasses: Record<CalendarColor, string> = {
  indigo: 'bg-indigo-100 text-indigo-800',
  violet: 'bg-violet-100 text-violet-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-800',
  sky: 'bg-sky-100 text-sky-800'
};

export const calendarDotClasses: Record<CalendarColor, string> = {
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500'
};

export const calendarChipClasses: Record<CalendarColor, string> = {
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  violet: 'border-violet-200 bg-violet-50 text-violet-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
  sky: 'border-sky-200 bg-sky-50 text-sky-900'
};

export function toCalendarColor(value: string): CalendarColor {
  return (CALENDAR_COLORS as readonly string[]).includes(value) ? (value as CalendarColor) : 'indigo';
}

export function Badge({
  color = 'slate',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { color?: CalendarColor | 'slate' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        color === 'slate' ? 'bg-slate-100 text-slate-700' : colorClasses[color],
        className
      )}
      {...props}
    />
  );
}
