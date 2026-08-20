'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell/app-shell';
import { getMe, type MeResponse } from '@/lib/api';

// Real app shell for every authenticated route (dashboard/calendar/
// projects/submissions/settings/export) — replaces each page's own
// duplicated <Nav /> + marketing-style gradient wrapper (see git history:
// 7 pages each hand-rolled the same shell independently, with no shared
// layout). Marketing/public pages ('/', /blog, /docs, /book/..., /login,
// /register) are outside this (app) route group and keep their own nav.
//
// No separate auth-guard logic here beyond calling getMe(): lib/api.ts's
// api() helper already redirects to /login on a 401 for every authenticated
// call (including this one) — that existing behavior is preserved exactly,
// just centralized instead of implicit-per-page.
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe().then((me) => {
      if (!cancelled) setUser(me);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50" />;
  }

  return <AppShell user={user}>{children}</AppShell>;
}
