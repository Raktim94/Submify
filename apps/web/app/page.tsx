'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" />
    </svg>
  );
}

function IconKey({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
    </svg>
  );
}

function IconCloud({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function IconFile({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

const reveal =
  'opacity-0 motion-reduce:opacity-100 motion-reduce:translate-y-0 animate-fade-in-up motion-reduce:animate-none';

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [activeFlow, setActiveFlow] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('submify_access_token');
    setSignedIn(!!token?.trim());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => setActiveFlow((n) => (n + 1) % 3), 4200);
    return () => clearInterval(id);
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-cyan-50/50">
        <div className="h-10 w-10 animate-pulse rounded-full bg-indigo-200/80" aria-hidden />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 via-white to-indigo-50/30 text-slate-800">
      {/* Ambient blobs */}
      <div
        className="pointer-events-none absolute -left-32 top-20 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-indigo-400/30 via-violet-400/25 to-fuchsia-300/20 blur-3xl motion-reduce:animate-none animate-blob"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-1/3 h-[380px] w-[380px] rounded-full bg-gradient-to-bl from-cyan-400/25 via-sky-400/20 to-indigo-300/20 blur-3xl motion-reduce:animate-none animate-blob [animation-delay:-7s]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/3 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-gradient-to-t from-indigo-200/40 to-transparent blur-3xl"
        aria-hidden
      />

      <div className="landing-grid pointer-events-none absolute inset-0 opacity-[0.45] motion-reduce:opacity-30" aria-hidden />

      {/* Nav */}
      <header
        className={`relative z-20 border-b border-slate-200/60 bg-white/70 backdrop-blur-md ${reveal}`}
        style={{ animationDelay: '0ms' }}
      >
        {signedIn ? (
          <div className="border-b border-emerald-200/80 bg-gradient-to-r from-emerald-50/95 via-teal-50/80 to-cyan-50/70">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6">
              <p className="text-emerald-950">
                <span className="font-medium">You&apos;re signed in.</span> Open the app or read the docs — no need to log out.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/dashboard"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
                >
                  Dashboard
                </Link>
                <Link
                  href="/docs"
                  className="rounded-lg border border-emerald-300/80 bg-white/90 px-3 py-1.5 font-medium text-emerald-900 transition hover:bg-emerald-50"
                >
                  Documentation
                </Link>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="font-display text-xl font-bold tracking-tight text-slate-900">
            Submify
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-2 sm:gap-3" aria-label="Site">
            <Link
              href="/docs"
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]"
            >
              Docs
            </Link>
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 active:scale-[0.98]"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="relative overflow-hidden rounded-xl bg-gradient-to-r from-brand-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40 active:scale-[0.98]"
            >
              <span className="relative z-10">Create account</span>
              <span className="absolute inset-0 -translate-x-full animate-shimmer motion-reduce:animate-none bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
        {/* Hero */}
        <section className="text-center">
          <p
            className={`mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-indigo-700 shadow-sm ${reveal}`}
            style={{ animationDelay: '80ms' }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Self-hosted · Your data stays yours
          </p>

          <h1
            className={`font-display mx-auto max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl md:text-6xl ${reveal}`}
            style={{ animationDelay: '140ms' }}
          >
            <span className="text-gradient animate-gradient-x bg-[length:200%_auto] motion-reduce:animate-none">
              Forms that land
            </span>
            <br />
            <span className="text-slate-900">in your inbox</span>
          </h1>

          <p
            className={`mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl ${reveal}`}
            style={{ animationDelay: '220ms' }}
          >
            A self-hosted form backend: collect submissions from your sites, review them in a dashboard, export to{' '}
            <span className="font-medium text-slate-800">Excel</span> or <span className="font-medium text-slate-800">PDF</span>
            , and optionally wire <span className="font-medium text-slate-800">Telegram</span> alerts or{' '}
            <span className="font-medium text-slate-800">S3</span>-compatible storage for large uploads.
          </p>

          <div
            className={`mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row ${reveal}`}
            style={{ animationDelay: '300ms' }}
          >
            <Link
              href="/register"
              className="group relative inline-flex min-w-[200px] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-brand-500 via-violet-600 to-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-indigo-500/30 transition hover:scale-[1.02] hover:shadow-indigo-500/45 active:scale-[0.98]"
            >
              <span className="relative z-10">Get started free</span>
              <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 transition group-hover:translate-x-full group-hover:opacity-100 motion-reduce:group-hover:translate-x-0" />
            </Link>
            <Link
              href="/login"
              className="inline-flex min-w-[200px] items-center justify-center rounded-2xl border-2 border-slate-200 bg-white/80 px-8 py-4 text-base font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:border-indigo-300 hover:bg-white active:scale-[0.98]"
            >
              Sign in
            </Link>
            <Link
              href="/docs"
              className="inline-flex min-w-[200px] items-center justify-center rounded-2xl border border-indigo-200/80 bg-indigo-50/90 px-8 py-4 text-base font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100 active:scale-[0.98]"
            >
              Documentation
            </Link>
          </div>
        </section>

        {/* Live flow strip */}
        <section
          className={`relative mt-20 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/60 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-md sm:p-10 ${reveal}`}
          style={{ animationDelay: '400ms' }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-indigo-600">How data flows</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { title: 'Your site', body: 'POST JSON with your public API key — same path everywhere.', k: 0 },
              { title: 'Submify API', body: 'Validates, stores, and triggers optional Telegram + S3 workflows.', k: 1 },
              { title: 'Your dashboard', body: 'List, export, or bulk-delete — up to 5,000 rows per project.', k: 2 }
            ].map((step, i) => (
              <button
                key={step.title}
                type="button"
                onClick={() => setActiveFlow(i)}
                className={`relative rounded-2xl border-2 px-5 py-6 text-left transition-all duration-300 ${
                  activeFlow === i
                    ? 'border-indigo-400 bg-gradient-to-br from-indigo-50 to-violet-50/80 shadow-md shadow-indigo-200/50'
                    : 'border-slate-100 bg-slate-50/50 hover:border-indigo-200 hover:bg-white'
                }`}
              >
                <span className="font-display text-lg font-bold text-slate-900">{step.title}</span>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
                <span
                  className={`mt-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    activeFlow === i ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-6 hidden h-1 overflow-hidden rounded-full bg-slate-100 md:block">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 transition-[width] duration-700 ease-out"
              style={{ width: `${((activeFlow + 1) / 3) * 100}%` }}
            />
          </div>
        </section>

        {/* Feature cards */}
        <section className="mt-24">
          <h2
            className={`font-display text-center text-3xl font-bold text-slate-900 sm:text-4xl ${reveal}`}
            style={{ animationDelay: '100ms' }}
          >
            Everything you need
          </h2>
          <p
            className={`mx-auto mt-3 max-w-2xl text-center text-slate-600 ${reveal}`}
            style={{ animationDelay: '160ms' }}
          >
            From first signup to exports — optional integrations when you are ready.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: IconUser,
                title: 'Register',
                desc: 'Your name, mobile number, email, and a password (8+ characters).',
                accent: 'from-violet-500 to-purple-600',
                delay: '0ms'
              },
              {
                icon: IconKey,
                title: 'Dashboard & API key',
                desc: 'Embed forms with your key. Each project holds up to 5,000 submissions.',
                accent: 'from-indigo-500 to-blue-600',
                delay: '80ms'
              },
              {
                icon: IconSend,
                title: 'Telegram (optional)',
                desc: 'Bot token + chat ID in Settings for real-time submission alerts.',
                accent: 'from-sky-500 to-cyan-600',
                delay: '160ms'
              },
              {
                icon: IconCloud,
                title: 'S3 storage (optional)',
                desc: 'Presigned uploads for large files. Small JSON works without it.',
                accent: 'from-emerald-500 to-teal-600',
                delay: '240ms'
              }
            ].map((card) => {
              const FeatureIcon = card.icon;
              return (
              <article
                key={card.title}
                className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-lg shadow-slate-200/40 backdrop-blur-sm transition duration-300 hover:-translate-y-2 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-200/30 ${reveal}`}
                style={{ animationDelay: card.delay }}
              >
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent} text-white shadow-lg transition group-hover:scale-110`}
                >
                  <FeatureIcon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-lg font-bold text-slate-900">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.desc}</p>
                <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-indigo-400/10 to-transparent opacity-0 transition group-hover:opacity-100" />
              </article>
            );
            })}
          </div>
        </section>

        {/* Detail band */}
        <section
          className={`mt-24 grid gap-10 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 via-white to-cyan-50/50 p-8 shadow-inner sm:grid-cols-2 sm:p-12 ${reveal}`}
          style={{ animationDelay: '200ms' }}
        >
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm">
              <IconFile className="h-4 w-4" />
              Exports
            </div>
            <h3 className="font-display text-2xl font-bold text-slate-900">Excel & PDF on demand</h3>
            <p className="mt-3 text-slate-600 leading-relaxed">
              Download submissions as spreadsheets or PDFs from the export tools. Bulk delete old rows when you approach the cap
              so new responses always have room.
            </p>
          </div>
          <div className="flex flex-col justify-center rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-lg">
            <dl className="space-y-4">
              <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-sm text-slate-500">Per-project limit</dt>
                <dd className="font-display text-2xl font-bold text-indigo-600">5,000</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-sm text-slate-500">Integrations</dt>
                <dd className="text-right font-medium text-slate-800">Telegram · S3</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-slate-500">Hosting</dt>
                <dd className="text-right font-medium text-slate-800">Self-hosted</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* CTA */}
        <section
          className={`relative mt-24 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700 via-violet-700 to-indigo-800 px-8 py-14 text-center shadow-2xl shadow-indigo-900/30 ${reveal}`}
          style={{ animationDelay: '120ms' }}
        >
          <div className="pointer-events-none absolute -left-20 top-0 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -right-10 bottom-0 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl" />
          <h2 className="font-display relative text-2xl font-bold text-white sm:text-3xl">Ready to own your form pipeline?</h2>
          <p className="relative mx-auto mt-3 max-w-lg text-indigo-100">
            Create an account in seconds — configure Telegram and S3 later from Settings.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex min-w-[180px] items-center justify-center rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-indigo-800 shadow-lg transition hover:bg-indigo-50 active:scale-[0.98]"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="inline-flex min-w-[180px] items-center justify-center rounded-xl border-2 border-white/40 bg-transparent px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
            >
              Sign in
            </Link>
          </div>
        </section>

        <footer className="mt-16 border-t border-slate-200/80 pt-8 text-center text-sm text-slate-500">
          <p className="mb-3">Submify — self-hosted form backend. Your keys, your storage, your rules.</p>
          <p>
            <Link href="/docs" className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900">
              Full documentation
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
