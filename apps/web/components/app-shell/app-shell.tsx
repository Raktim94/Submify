'use client';

import { ReactNode, useState } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import type { MeResponse } from '@/lib/api';

// The authenticated app's real shell — a persistent sidebar + topbar,
// replacing components/nav.tsx's marketing-site-style pill nav (still used
// on the public/marketing pages, which don't render this). Rendered once
// by app/(app)/layout.tsx; individual pages under that route group no
// longer own their own chrome.
export function AppShell({ user, children }: { user: MeResponse; children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
