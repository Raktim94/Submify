'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Bell, CalendarPlus, CheckSquare, ChevronDown, FolderPlus, Link2, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { EventDialog } from '@/components/calendar/event-dialog';
import type { PersonalEventKind } from '@/lib/personal-events';

// The one global "+ Create" reachable from every authenticated page — the
// user asked explicitly for "quick access buttons," and this is the
// always-visible entry point into creating a personal event/task/reminder
// without navigating to /calendar first. Booking links and projects route
// there/to /projects instead, since those already have their own full
// creation forms that a dropdown item shouldn't try to duplicate inline.
export function QuickAccessMenu() {
  const router = useRouter();
  const [dialogKind, setDialogKind] = useState<PersonalEventKind | null>(null);

  return (
    <>
      <DropdownMenu
        trigger={({ onClick }) => (
          <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:shadow-lg"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Create</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
          </button>
        )}
      >
        <DropdownMenuItem icon={<CalendarPlus className="h-4 w-4" aria-hidden />} onSelect={() => setDialogKind('event')}>
          New event
        </DropdownMenuItem>
        <DropdownMenuItem icon={<CheckSquare className="h-4 w-4" aria-hidden />} onSelect={() => setDialogKind('task')}>
          New task
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Bell className="h-4 w-4" aria-hidden />} onSelect={() => setDialogKind('reminder')}>
          New reminder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Link2 className="h-4 w-4" aria-hidden />} onSelect={() => router.push('/calendar?tab=event-types')}>
          New booking link
        </DropdownMenuItem>
        <DropdownMenuItem icon={<FolderPlus className="h-4 w-4" aria-hidden />} onSelect={() => router.push('/projects')}>
          New project
        </DropdownMenuItem>
      </DropdownMenu>

      <EventDialog
        open={dialogKind !== null}
        kind={dialogKind ?? 'event'}
        initialDate={new Date()}
        onClose={() => setDialogKind(null)}
        onSaved={(item) => {
          setDialogKind(null);
          router.push(`/calendar?view=day&date=${format(new Date(item.starts_at), 'yyyy-MM-dd')}`);
        }}
      />
    </>
  );
}
