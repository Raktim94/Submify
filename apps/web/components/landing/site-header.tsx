'use client';

import Link from 'next/link';
import { SubmifyLogo } from '@/components/submify-logo';

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/95 shadow-sm shadow-slate-200/30 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link href="/" className="inline-flex shrink-0 items-center transition-opacity hover:opacity-90" aria-label="Submify home">
            <SubmifyLogo className="h-8 w-auto sm:h-9" priority />
          </Link>
          {signedIn ? (
            <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex" title="You have an active session">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              <span className="truncate">Signed in</span>
            </span>
          ) : null}
        </div>

        <nav className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Primary">
          <Link
            href="/docs"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Docs
          </Link>
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:shadow-lg"
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
