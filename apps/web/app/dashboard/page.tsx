'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/nav';
import { api, getMe } from '../../lib/api';

type HealthState = { status: string; db: string } | null;
type UpdateState = {
  update_available: boolean;
  latest_version: string;
  current_version: string;
  update_trigger_enabled?: boolean;
} | null;

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
  const [update, setUpdate] = useState<UpdateState>(null);
  const [userKey, setUserKey] = useState('');
  const [welcomeName, setWelcomeName] = useState('');
  const [updateAction, setUpdateAction] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [updateActionMsg, setUpdateActionMsg] = useState('');

  useEffect(() => {
    setWelcomeName(localStorage.getItem('submify_user_name') || '');
    api<HealthState>('/system/health')
      .then(setHealth)
      .catch(() => setHealth({ status: 'degraded', db: 'unknown' }));
    api<UpdateState>('/system/update-status')
      .then(setUpdate)
      .catch(() =>
        setUpdate({
          update_available: false,
          latest_version: '',
          current_version: '',
          update_trigger_enabled: false
        })
      );
    getMe()
      .then((me) => {
        setUserKey(me.api_key);
        localStorage.setItem('submify_user_api_key', me.api_key);
        localStorage.setItem('submify_user_name', me.full_name);
        localStorage.setItem('submify_user_phone', me.phone);
        setWelcomeName(me.full_name);
      })
      .catch(() => {
        const k = localStorage.getItem('submify_user_api_key') || '';
        setUserKey(k);
      });
  }, []);

  const dbOk = health?.db === 'up';
  const apiOk = health?.status === 'ok';
  const overallOk = dbOk && apiOk;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Nav />

        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Dashboard</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Your home base: copy your <strong className="font-medium text-slate-800">account API key</strong> for HTML forms,
            check that the server and database are healthy, and optionally pull a newer Docker image when your host allows
            it.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50/50 p-6 shadow-md sm:p-8">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-indigo-800">What to do next</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700 marker:text-indigo-600 sm:text-base">
            <li>
              <strong className="text-slate-900">Copy your account API key</strong> below. Send it in the{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs text-indigo-900">x-api-key</code> header on{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">POST /api/submit</code> (same path on every host — see{' '}
              <Link className="font-medium text-brand-700 underline" href="/projects">
                Projects
              </Link>{' '}
              for project-specific keys).
            </li>
            <li>
              Open <Link className="font-medium text-brand-700 underline hover:text-brand-900" href="/projects">Projects</Link>{' '}
              to see each inbox, open <strong className="text-slate-900">Submissions</strong> for rows, export, or bulk
              delete (each project holds up to <strong className="text-slate-900">5,000</strong> submissions).
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
          <h2 className="font-display text-xl font-bold text-indigo-950">Your account API key</h2>
          <p className="mt-2 text-sm leading-relaxed text-indigo-900/85 sm:text-base">
            This key identifies <em>your</em> account and routes submissions to your <strong>default</strong> inbox. Use{' '}
            <code className="rounded-md bg-indigo-100/80 px-2 py-0.5 text-xs font-medium">POST /api/submit</code> on your
            current origin (shown under Projects). Per-project public keys (
            <code className="rounded bg-white px-1.5 py-0.5 text-xs">pk_live_…</code>) use the same endpoint.
          </p>
          {userKey ? (
            <div className="mt-5 flex flex-wrap items-stretch gap-2 sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-xl border border-indigo-100 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 sm:text-sm">
                {userKey}
              </code>
              <button
                type="button"
                className="shrink-0 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-brand-700"
                onClick={() => navigator.clipboard.writeText(userKey)}
              >
                Copy key
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Loading key…</p>
          )}
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
                The server periodically compares its version to GitHub releases (when outbound network allows). Use the button
                only if your Docker setup exposes the socket and project folder to the API container.
              </p>
            </div>

            {!update ? (
              <div className="flex-1 space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
              </div>
            ) : (
              <>
                <dl className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-baseline justify-between gap-4 border-b border-slate-200/80 pb-3">
                    <dt className="text-sm text-slate-500">Running version</dt>
                    <dd className="font-mono text-sm font-semibold text-slate-900">{update.current_version || '—'}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-b border-slate-200/80 pb-3">
                    <dt className="text-sm text-slate-500">Latest on GitHub</dt>
                    <dd className="font-mono text-sm font-semibold text-slate-900">
                      {update.latest_version?.trim() ? update.latest_version : '— (not loaded)'}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 pt-1">
                    <dt className="text-sm text-slate-500">Summary</dt>
                    <dd className="max-w-[14rem] text-right text-sm text-slate-800">
                      {update.update_available ? (
                        <span className="font-medium text-indigo-700">A newer release exists.</span>
                      ) : update.latest_version?.trim() ? (
                        <span className="text-emerald-700">Matches the latest published release.</span>
                      ) : (
                        <span className="text-slate-600">Version check unavailable; your install still works.</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-1 flex-col justify-end">
                  {update.update_trigger_enabled === false ? (
                    <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                      <strong className="font-semibold">In-dashboard updates are off</strong> (<code className="rounded bg-white/90 px-1">ALLOW_UPDATE_TRIGGER</code>
                      ). Enable it in compose and mount Docker, or SSH to the host and run{' '}
                      <code className="rounded bg-white/90 px-1">docker compose pull &amp;&amp; docker compose up -d</code> yourself.
                    </p>
                  ) : (
                    <p className="mb-3 text-xs leading-relaxed text-slate-500">
                      <strong className="text-slate-700">Update &amp; restart</strong> runs{' '}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.7rem]">docker compose pull</code> and{' '}
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.7rem]">up -d</code> in the mounted project
                      directory. Expect a short outage while containers recreate.
                    </p>
                  )}
                  <button
                    type="button"
                    className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white shadow-lg hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={updateAction === 'loading' || update.update_trigger_enabled === false}
                    onClick={async () => {
                      setUpdateAction('loading');
                      setUpdateActionMsg('');
                      try {
                        await api<{ status: string }>('/system/update-trigger', { method: 'POST' });
                        setUpdateAction('done');
                        setUpdateActionMsg(
                          'Update started. Images are pulling and containers will restart — refresh this page in a minute.'
                        );
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
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
