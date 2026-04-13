'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/nav';
import { api, getMe } from '../../lib/api';

export default function DashboardPage() {
  const [health, setHealth] = useState<any>(null);
  const [update, setUpdate] = useState<any>(null);
  const [userKey, setUserKey] = useState('');
  const [welcomeName, setWelcomeName] = useState('');

  useEffect(() => {
    setWelcomeName(localStorage.getItem('submify_user_name') || '');
    api('/system/health').then(setHealth).catch(() => setHealth({ status: 'degraded' }));
    api('/system/update-status').then(setUpdate).catch(() => setUpdate({ update_available: false }));
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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Nav />
      <h1 className="mb-4 text-3xl font-bold">Dashboard</h1>
      {welcomeName ? (
        <p className="mb-4 text-slate-600">
          Signed in as <span className="font-medium text-slate-800">{welcomeName}</span>. Open{' '}
          <Link className="text-brand-700 underline" href="/projects">
            Projects
          </Link>{' '}
          to view submissions (up to 5000 per project), or{' '}
          <Link className="text-brand-700 underline" href="/settings">
            Settings
          </Link>{' '}
          for optional Telegram and S3.
        </p>
      ) : null}
      <section className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <h2 className="font-semibold text-indigo-900">Your form API key</h2>
        <p className="mt-1 text-sm text-indigo-800">
          Use this key on every website: same URL path and <code className="rounded bg-white px-1">x-api-key</code> header.
          Submissions are stored in your default inbox; other users cannot see them.
        </p>
        {userKey ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="max-w-full flex-1 break-all rounded bg-white p-2 text-xs">{userKey}</code>
            <button type="button" onClick={() => navigator.clipboard.writeText(userKey)}>
              Copy
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Loading key…</p>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg bg-white p-4 shadow">
          <h2 className="font-semibold">System Health</h2>
          <pre className="mt-2 text-sm">{JSON.stringify(health, null, 2)}</pre>
        </section>
        <section className="rounded-lg bg-white p-4 shadow">
          <h2 className="font-semibold">Updates</h2>
          <pre className="mt-2 text-sm">{JSON.stringify(update, null, 2)}</pre>
          <button
            className="mt-3"
            onClick={async () => {
              await api('/system/update-trigger', { method: 'POST' });
              alert('Update trigger requested.');
            }}
          >
            Pull & Restart
          </button>
        </section>
      </div>
    </main>
  );
}
