'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteHeader } from '@/components/landing/site-header';
import { getBootstrapStatus, isSessionValid } from '@/lib/api';

export function BlogShell({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isSessionValid();
      if (cancelled) return;
      setSignedIn(ok);
      if (!ok) {
        try {
          const b = await getBootstrapStatus();
          if (!cancelled) setSetupRequired(b.setup_required);
        } catch {
          if (!cancelled) setSetupRequired(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/30 text-slate-800">
      <SiteHeader signedIn={signedIn} setupRequired={setupRequired} />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">{children}</main>
      <footer className="mt-16 border-t border-slate-200/80 py-8 text-center text-sm text-slate-500">
        <p>
          <Link href="/blog" className="font-medium text-brand-700 underline decoration-indigo-300 underline-offset-2 hover:text-brand-900">
            More posts
          </Link>{' '}
          ·{' '}
          <Link href="/docs" className="font-medium text-brand-700 underline decoration-indigo-300 underline-offset-2 hover:text-brand-900">
            Documentation
          </Link>{' '}
          ·{' '}
          <Link href="/" className="font-medium text-brand-700 underline decoration-indigo-300 underline-offset-2 hover:text-brand-900">
            Submify home
          </Link>
        </p>
      </footer>
    </div>
  );
}
