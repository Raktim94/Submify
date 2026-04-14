'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/nav';
import { api, getDashboardSummary, getMe, type DashboardSummary } from '../../lib/api';

type HealthState = { status: string; db: string } | null;

const LS_SUB_SEEN = 'submify_last_seen_submission_at';

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]' : 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]'}`}
      aria-hidden
    />
  );
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthState>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [welcomeName, setWelcomeName] = useState('');
  const [submissionBanner, setSubmissionBanner] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported' | null
  >(null);
  const submissionNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
    } else {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    setWelcomeName(localStorage.getItem('submify_user_name') || '');
    api<HealthState>('/system/health')
      .then(setHealth)
      .catch(() => setHealth({ status: 'degraded', db: 'unknown' }));

    getDashboardSummary(true)
      .then(setSummary)
      .catch(() => setSummary({ latest_submission: null }));

    const poll = setInterval(() => {
      getDashboardSummary(false)
        .then(setSummary)
        .catch(() => {});
    }, 60_000);

    getMe()
      .then((me) => {
        localStorage.setItem('submify_user_name', me.full_name);
        localStorage.setItem('submify_user_phone', me.phone);
        setWelcomeName(me.full_name);
      })
      .catch(() => {});

    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!summary?.latest_submission?.at) {
      setSubmissionBanner(false);
      return;
    }
    const at = summary.latest_submission.at;
    const last = localStorage.getItem(LS_SUB_SEEN);
    if (!last) {
      localStorage.setItem(LS_SUB_SEEN, at);
      setSubmissionBanner(false);
      return;
    }
    if (new Date(at).getTime() > new Date(last).getTime()) {
      setSubmissionBanner(true);
    } else {
      setSubmissionBanner(false);
    }
  }, [summary]);

  useEffect(() => {
    if (!submissionBanner || !summary?.latest_submission) return;
    const key = summary.latest_submission.at;
    if (submissionNotifiedRef.current === key) return;
    submissionNotifiedRef.current = key;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('New form submission', {
          body: `${summary.latest_submission.project_name}`,
          tag: `submify-sub-${key}`
        });
      } catch {
        /* ignore */
      }
    }
  }, [submissionBanner, summary]);

  const dbOk = health?.db === 'up';
  const apiOk = health?.status === 'ok';
  const overallOk = dbOk && apiOk;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Nav />

        {notificationPermission !== null && notificationPermission !== 'unsupported' ? (
          <div className="mb-6 rounded-2xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50 via-white to-violet-50/80 px-4 py-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Desktop notifications</p>
              <p className="mt-1 text-sm text-slate-600">
                Get alerted for new submissions when this tab is in the background.
              </p>
            </div>
            <div className="mt-3 shrink-0 sm:mt-0">
              {notificationPermission === 'default' ? (
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-700/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                  onClick={() => {
                    void Notification.requestPermission().then((p) => setNotificationPermission(p));
                  }}
                >
                  Enable notifications
                </button>
              ) : notificationPermission === 'granted' ? (
                <span className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
                  Enabled
                </span>
              ) : (
                <span className="block max-w-md text-sm text-amber-900">
                  Blocked in browser settings. Allow notifications for this site, then reload the page.
                </span>
              )}
            </div>
          </div>
        ) : null}

        {submissionBanner && summary?.latest_submission ? (
          <div
            className="mb-6 flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <p className="text-sm text-sky-950">
              <strong className="font-semibold">New form submission</strong> in{' '}
              <span className="font-medium">{summary.latest_submission.project_name}</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
                href={`/projects/${summary.latest_submission.project_id}/submissions`}
              >
                View submissions
              </Link>
              <button
                type="button"
                className="rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100"
                onClick={() => {
                  localStorage.setItem(LS_SUB_SEEN, summary.latest_submission!.at);
                  setSubmissionBanner(false);
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Dashboard</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Open <Link className="font-medium text-brand-700 underline" href="/projects">Projects</Link> to create inboxes and
            copy each project&apos;s <strong className="font-medium text-slate-800">public key</strong> and{' '}
            <strong className="font-medium text-slate-800">secret key</strong> for{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">POST /api/submit</code>. Here you can check system health.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50/50 p-6 shadow-md sm:p-8">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-indigo-800">What to do next</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700 marker:text-indigo-600 sm:text-base">
            <li>
              Go to <Link className="font-medium text-brand-700 underline" href="/projects">Projects</Link>, create a
              project if you need a new inbox, then use that project&apos;s <strong className="text-slate-900">public key</strong>{' '}
              in <code className="rounded bg-white px-1.5 py-0.5 text-xs">x-api-key</code> and the{' '}
              <strong className="text-slate-900">secret key</strong> only for optional HMAC (
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">x-signature</code>) from a server.
            </li>
            <li>
              Open{' '}
              <Link className="font-medium text-brand-700 underline" href="/submissions">
                Submissions
              </Link>{' '}
              to pick a project inbox, or use <strong className="text-slate-900">Open submissions</strong> on each project. Export
              or bulk delete rows (up to <strong className="text-slate-900">5,000</strong> per project).
            </li>
            <li>
              Configure Telegram and S3 per project from{' '}
              <Link className="font-medium text-brand-700 underline" href="/projects">
                Projects
              </Link>
              .
            </li>
          </ol>
        </section>

        {welcomeName ? (
          <p className="mb-6 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm">
            Signed in as <span className="font-semibold text-slate-900">{welcomeName}</span>.
          </p>
        ) : null}

        <section className="mb-8 rounded-2xl border border-indigo-200 bg-white p-6 shadow-lg shadow-indigo-100/50 sm:p-8">
          <h2 className="font-display text-xl font-bold text-indigo-950">Form submissions</h2>
          <p className="mt-2 text-sm leading-relaxed text-indigo-900/85 sm:text-base">
            Keys are <strong className="text-indigo-950">per project</strong> (public + secret). Manage them on{' '}
            <Link className="font-medium text-brand-700 underline" href="/projects">
              Projects
            </Link>
            — not here. Use the submit URL shown there with each project&apos;s public key in{' '}
            <code className="rounded-md bg-indigo-100/80 px-2 py-0.5 text-xs font-medium">x-api-key</code>.
          </p>
          <Link
            className="mt-5 inline-flex rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-700"
            href="/projects"
          >
            Open Projects
          </Link>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
          <h2 className="font-display text-lg font-bold text-slate-900">Developer &amp; ownership</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Submify is made by <strong className="text-slate-900">NODEDR PRIVATE LIMITED</strong>.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>
              Lead Developer &amp; Founder: <strong className="text-slate-900">RAKTIM RANJIT</strong>
            </li>
            <li>
              Website:{' '}
              <a className="font-medium text-brand-700 underline" href="https://www.nodedr.com" target="_blank" rel="noreferrer">
                www.nodedr.com
              </a>
            </li>
          </ul>
        </section>

        <div className="grid gap-6">
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">System health</h2>
                <p className="mt-1 text-sm text-slate-500">Quick check that this API can talk to PostgreSQL.</p>
              </div>
              {!health ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">Checking…</span>
              ) : (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    overallOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {overallOk ? 'All good' : 'Needs attention'}
                </span>
              )}
            </div>

            {!health ? (
              <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
              </div>
            ) : (
              <ul className="space-y-3">
                <li className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <StatusDot ok={apiOk} />
                      <div>
                        <p className="font-medium text-slate-900">API service</p>
                        <p className="text-sm text-slate-500">
                          {apiOk ? 'Responding to HTTP requests.' : 'Status is not OK — check container logs.'}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-600">{apiOk ? 'OK' : health.status}</span>
                  </div>
                </li>
                <li className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <StatusDot ok={dbOk} />
                      <div>
                        <p className="font-medium text-slate-900">Database</p>
                        <p className="text-sm text-slate-500">
                          {dbOk ? 'PostgreSQL accepted a ping.' : 'Cannot connect — verify DATABASE_URL and that Postgres is up.'}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-600">{dbOk ? 'Connected' : health.db}</span>
                  </div>
                </li>
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
