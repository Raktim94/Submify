'use client';

import Link from 'next/link';

const GITHUB_REPO = 'https://github.com/Raktim94/Submify';

type Props = {
  signedIn: boolean;
};

export function SubmifyHero({ signedIn }: Props) {
  return (
    <section className="relative border-b border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.12),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pb-20 sm:pt-16">
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-slate-200/90 bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            Self-hosted
          </span>
          <span className="rounded-full border border-slate-200/90 bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
            PostgreSQL
          </span>
          <span className="rounded-full border border-indigo-200/80 bg-indigo-50/90 px-3 py-1 text-xs font-semibold text-indigo-800 shadow-sm">
            Your data
          </span>
        </div>

        <h1 className="font-display text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
          Submify: own your form pipeline
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-slate-600 sm:text-lg">
          The bridge between your static frontend and your data — self-hosted, with a real dashboard, exports, and alerts. No
          middleman on your submissions.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            GitHub
          </a>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50"
          >
            Documentation
          </Link>
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:from-indigo-500 hover:to-violet-500"
            >
              Create account
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
