'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/nav';
import { api, getDashboardSummary, getMe, type DashboardSummary } from '../../lib/api';

type HealthState = { status: string; db: string } | null;

const LS_SUB_SEEN = 'submify_last_seen_submission_at';
const LS_UPDATE_DISMISS = 'submify_dismissed_update_version';

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
  const [updateAction, setUpdateAction] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [updateActionMsg, setUpdateActionMsg] = useState('');
  const [submissionBanner, setSubmissionBanner] = useState(false);
  const [updateBanner, setUpdateBanner] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported' | null
  >(null);
  const submissionNotifiedRef = useRef<string | null>(null);
  const updateNotifiedRef = useRef<string | null>(null);

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
      .catch(() =>
        setSummary({
          update_available: false,
          latest_version: '',
          current_version: '',
          update_trigger_enabled: false,
          latest_submission: null
        })
      );

    const poll = setInterval(() => {
      getDashboardSummary(false)
        .then(setSummary)
        .catch(() => {});
    }, 60_000);

    getMe()
      .then((me) => {
        localStorage.setItem('submify_user_api_key', me.api_key);
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
    if (!summary) return;
    if (summary.update_available && summary.latest_version?.trim()) {
      const dismissed = localStorage.getItem(LS_UPDATE_DISMISS);
      setUpdateBanner(dismissed !== summary.latest_version);
    } else {
      setUpdateBanner(false);
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

  useEffect(() => {
    if (!updateBanner || !summary?.latest_version?.trim()) return;
    const key = summary.latest_version;
    if (updateNotifiedRef.current === key) return;
    updateNotifiedRef.current = key;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Submify update available', {
          body: `Latest release: ${summary.latest_version}`,
          tag: `submify-up-${key}`
        });
      } catch {
        /* ignore */
      }
    }
  }, [updateBanner, summary]);

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
                Get alerted for new submissions and app updates when this tab is in the background.
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

        {updateBanner && summary?.update_available ? (
          <div
            className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <p className="text-sm text-amber-950">
              <strong className="font-semibold">Update available</strong> — GitHub latest is{' '}
              <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs">{summary.latest_version}</code> (you are on{' '}
              <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs">{summary.current_version}</code>).
            </p>
            <button
              type="button"
              className="shrink-0 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
              onClick={() => {
                if (summary.latest_version) localStorage.setItem(LS_UPDATE_DISMISS, summary.latest_version);
                setUpdateBanner(false);
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Dashboard</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Open <Link className="font-medium text-brand-700 underline" href="/projects">Projects</Link> to create inboxes and
            copy each project&apos;s <strong className="font-medium text-slate-800">public key</strong> and{' '}
            <strong className="font-medium text-slate-800">secret key</strong> for{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">POST /api/submit</code>. Here you can check health
            and optional updates.
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
              Optional: <Link className="font-medium text-brand-700 underline" href="/settings">Settings</Link> for Telegram
              alerts or S3 for large file uploads.
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

        <div className="grid gap-6 lg:grid-cols-2">
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

          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-slate-900">App updates</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                The server checks <strong className="text-slate-700">GitHub</strong> for the latest release or tag (set{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">GITHUB_REPO</code> to your fork). Optional{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">GITHUB_TOKEN</code> avoids rate limits. Use the button
                only if Docker socket and project folder are mounted into the API container.
              </p>
            </div>

            {!summary ? (
              <div className="flex-1 space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
              </div>
            ) : (
              <>
                <dl className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-baseline justify-between gap-4 border-b border-slate-200/80 pb-3">
                    <dt className="text-sm text-slate-500">Running version</dt>
                    <dd className="font-mono text-sm font-semibold text-slate-900">{summary.current_version || '—'}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-b border-slate-200/80 pb-3">
                    <dt className="text-sm text-slate-500">Latest on GitHub</dt>
                    <dd className="font-mono text-sm font-semibold text-slate-900">
                      {summary.latest_version?.trim() ? summary.latest_version : '— (checking or blocked)'}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 pt-1">
                    <dt className="text-sm text-slate-500">Summary</dt>
                    <dd className="max-w-[14rem] text-right text-sm text-slate-800">
                      {summary.update_available ? (
                        <span className="font-medium text-indigo-700">A newer GitHub version exists.</span>
                      ) : summary.latest_version?.trim() ? (
                        <span className="text-emerald-700">Up to date with the latest GitHub release/tag.</span>
                      ) : (
                        <span className="text-slate-600">
                          Could not load remote version (network, rate limit, or no tags/releases yet). Your install still runs.
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-1 flex-col justify-end">
                  {summary.update_trigger_enabled === false ? (
                    <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                      <strong className="font-semibold">In-dashboard updates are off</strong> (<code className="rounded bg-white/90 px-1">ALLOW_UPDATE_TRIGGER</code>
                      ). Enable it in compose and mount Docker, or SSH to the host and run{' '}
                      <code className="rounded bg-white/90 px-1">docker compose pull &amp;&amp; docker compose up -d</code> yourself.
                    </p>
                  ) : (
                    <p className="mb-3 text-xs leading-relaxed text-slate-500">
                      <strong className="text-slate-700">Update &amp; restart</strong> runs{' '}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.7rem]">git pull</code>,{' '}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.7rem]">docker compose pull</code>,{' '}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.7rem]">docker compose up --build -d</code>,
                      prune cleanup, and a recent API logs snapshot from the mounted project directory.
                    </p>
                  )}
                  <button
                    type="button"
                    className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white shadow-lg hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={updateAction === 'loading' || summary.update_trigger_enabled === false}
                    onClick={async () => {
                      setUpdateAction('loading');
                      setUpdateActionMsg('');
                      try {
                        await api<{ status: string }>('/system/update-trigger', { method: 'POST' });
                        setUpdateAction('done');
                        setUpdateActionMsg(
                          'Update started. This may take a few minutes while git/docker steps complete.'
                        );
                        getDashboardSummary(true).then(setSummary).catch(() => {});
                      } catch (e) {
                        setUpdateAction('error');
                        const msg = e instanceof Error ? e.message : 'Request failed.';
                        setUpdateActionMsg(
                          msg.includes('disabled')
                            ? 'Dashboard updates are disabled in server config. Use the host shell to update Docker.'
                            : msg
                        );
                      }
                    }}
                  >
                    {updateAction === 'loading' ? 'Starting…' : 'Update & restart'}
                  </button>
                  {updateActionMsg ? (
                    <p
                      className={`mt-3 text-sm ${updateAction === 'error' ? 'text-red-700' : 'text-emerald-800'}`}
                      role="status"
                    >
                      {updateActionMsg}
                    </p>
                  ) : null}
                  {summary.update_run ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
                      <p>
                        <strong>Last update run:</strong>{' '}
                        {summary.update_run.running
                          ? 'Running...'
                          : summary.update_run.success
                            ? 'Success'
                            : summary.update_run.message
                              ? 'Failed'
                              : 'Not started'}
                      </p>
                      {summary.update_run.message ? <p className="mt-1">{summary.update_run.message}</p> : null}
                      {summary.update_run.started_at ? <p className="mt-1">Started: {summary.update_run.started_at}</p> : null}
                      {summary.update_run.ended_at ? <p>Ended: {summary.update_run.ended_at}</p> : null}
                      {summary.update_run.output ? (
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                          {summary.update_run.output}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
