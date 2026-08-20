'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Download, FolderKanban, Inbox, LayoutDashboard, Settings, X } from 'lucide-react';
import { SubmifyLogo } from '@/components/submify-logo';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/submissions', label: 'Submissions', icon: Inbox },
  { href: '/export', label: 'Export', icon: Download },
  { href: '/settings', label: 'Settings', icon: Settings }
] as const;

// Same active-route logic components/nav.tsx already used (submissions also
// matches the nested per-project submissions route; projects excludes it so
// the two links are never both highlighted at once).
function linkIsActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  if (href === '/submissions') return pathname === '/submissions' || /\/projects\/[^/]+\/submissions/.test(pathname);
  if (href === '/projects') return pathname.startsWith('/projects') && !pathname.includes('/submissions');
  return pathname.startsWith(href);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = linkIsActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              active
                ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white shadow-md shadow-indigo-500/25'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: persistent rail */}
      <aside className="hidden w-[240px] shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5" aria-label="Submify dashboard">
          <SubmifyLogo className="h-7 w-auto" />
        </Link>
        <div className="flex-1 overflow-y-auto pb-4">
          <NavLinks pathname={pathname} />
        </div>
      </aside>

      {/* Mobile: slide-over drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              aria-hidden
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-white shadow-2xl md:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <div className="flex items-center justify-between px-5 py-5">
                <SubmifyLogo className="h-7 w-auto" />
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="rounded-lg bg-transparent p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pb-4">
                <NavLinks pathname={pathname} onNavigate={onCloseMobile} />
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
