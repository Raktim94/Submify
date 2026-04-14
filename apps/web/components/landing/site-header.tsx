'use client';

import Link from 'next/link';

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="relative z-50 border-b border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/40 backdrop-blur-xl">
      {signedIn ? (
        <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 via-emerald-50/40 to-teal-50/30">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
                aria-hidden
              />
              <p className="text-sm leading-snug text-slate-800">
                <span className="font-semibold text-slate-900">Signed in.</span>{' '}
                Continue to the dashboard, browse docs, or explore the site — logging out is optional.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800"
              >
                Dashboard
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-300 hover:bg-slate-50"
              >
                Documentation
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-tight text-slate-900 transition hover:text-indigo-700 sm:text-2xl"
        >
          Submify
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="Primary">
          <Link
            href="/docs"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Docs
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:shadow-lg"
          >
            Create account
          </Link>
        </nav>
      </div>
    </header>
  );
}
