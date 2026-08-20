'use client';

import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { whatsNewEntries } from '@/lib/whats-new';

const LS_LAST_SEEN = 'submify_whats_new_last_seen_id';

// A lightweight in-app changelog, reachable from every authenticated page —
// deliberately NOT a public marketing page: the public site
// (submify.nodedr.com) was rebuilt as a single-card app-onboarding screen
// with no Blog/Docs, and this stays inside that boundary. "Seen" state is
// local-only (no backend endpoint), same convention as the dashboard's
// last-seen-submission banner in app/(app)/dashboard/page.tsx.
export function WhatsNewMenu() {
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    const latest = whatsNewEntries[0];
    if (!latest) return;
    setUnseen(localStorage.getItem(LS_LAST_SEEN) !== latest.id);
  }, []);

  if (whatsNewEntries.length === 0) return null;

  return (
    <DropdownMenu
      className="w-80 max-h-[70vh] overflow-y-auto py-3"
      trigger={({ onClick }) => (
        <button
          type="button"
          onClick={() => {
            onClick();
            const latest = whatsNewEntries[0];
            if (latest) {
              localStorage.setItem(LS_LAST_SEEN, latest.id);
              setUnseen(false);
            }
          }}
          className="relative rounded-full p-2 text-slate-600 transition hover:bg-slate-100"
          aria-label="What's new"
        >
          <Sparkles className="h-5 w-5" aria-hidden />
          {unseen ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-600 ring-2 ring-white" aria-hidden />
          ) : null}
        </button>
      )}
    >
      <div className="px-3.5 pb-2">
        <p className="text-sm font-semibold text-slate-900">What&rsquo;s new</p>
      </div>
      <div className="flex flex-col gap-4 px-3.5">
        {whatsNewEntries.map((entry) => (
          <div key={entry.id} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
            <p className="text-xs font-medium text-slate-400">{format(parseISO(entry.date), 'MMM d, yyyy')}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{entry.title}</p>
            <ul className="mt-1.5 space-y-1">
              {entry.highlights.map((line) => (
                <li key={line} className="flex gap-1.5 text-xs leading-relaxed text-slate-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </DropdownMenu>
  );
}
