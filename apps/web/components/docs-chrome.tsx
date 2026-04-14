'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const nav = [
  { id: 'overview', label: 'Overview' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'quick-start', label: 'Quick start' },
  { id: 'auth', label: 'Sign-in & tokens' },
  { id: 'projects-keys', label: 'Projects & keys' },
  { id: 'submit-api', label: 'POST /api/submit' },
  { id: 'cors-origins', label: 'CORS & origins' },
  { id: 'rate-limits', label: 'Rate limits' },
  { id: 'dashboard', label: 'Dashboard & updates' },
  { id: 'submissions', label: 'Submissions & export' },
  { id: 'settings', label: 'Telegram & S3' },
  { id: 'self-hosting', label: 'Self-hosting' },
  { id: 'env-vars', label: 'Environment variables' },
  { id: 'troubleshooting', label: 'Troubleshooting' }
];

export function DocsChrome({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(!!localStorage.getItem('submify_access_token')?.trim());
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 via-indigo-50/20 to-violet-50/30">
      <div
        className="pointer-events-none absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-indigo-400/25 via-violet-300/20 to-transparent blur-3xl motion-reduce:animate-none animate-blob"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-32 top-40 h-[420px] w-[420px] rounded-full bg-gradient-to-bl from-cyan-400/20 to-transparent blur-3xl motion-reduce:animate-none animate-blob [animation-delay:-9s]"
        aria-hidden
      />

      <header className="relative z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="font-display text-xl font-bold tracking-tight text-slate-900 transition hover:text-brand-700">
              Submify
            </Link>
            <span className="hidden rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-800 sm:inline">
              Documentation
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-2" aria-label="Documentation navigation">
            <Link
              href="/"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/80"
            >
              Home
            </Link>
            {signedIn ? (
              <Link
                href="/dashboard"
                className="rounded-xl bg-gradient-to-r from-brand-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:shadow-lg"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 lg:flex-row lg:gap-12 lg:px-6 lg:py-12">
        <aside className="lg:w-56 lg:shrink-0">
          <div className="lg:sticky lg:top-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">On this page</p>
            <nav className="max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-lg shadow-indigo-100/30 backdrop-blur-sm">
              <ul className="space-y-0.5">
                {nav.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="block rounded-lg px-2.5 py-2 text-sm text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-900"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <label className="mt-4 block lg:hidden">
              <span className="mb-1 block text-xs font-medium text-slate-500">Jump to section</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Choose…
                </option>
                {nav.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>

        <article className="doc-prose min-w-0 flex-1 pb-16">{children}</article>
      </div>
    </div>
  );
}
