'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TabItem = { value: string; label: ReactNode; icon?: ReactNode };

export function Tabs({
  items,
  value,
  onChange,
  className
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              // bg-transparent base is required, not decorative — see
              // month-view.tsx's comment: globals.css's unscoped `button`
              // reset fills any unset background with solid brand purple.
              'inline-flex items-center gap-1.5 rounded-lg bg-transparent px-3.5 py-1.5 text-sm font-medium transition',
              active ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
