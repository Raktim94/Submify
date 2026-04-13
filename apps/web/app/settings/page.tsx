'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/nav';
import { getMe, updateIntegrations, type MeResponse } from '../../lib/api';

export default function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [telegramToken, setTelegramToken] = useState('');
  const [s3Access, setS3Access] = useState('');
  const [s3Secret, setS3Secret] = useState('');
  const [status, setStatus] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    getMe()
      .then((m) => setMe(m))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load profile'));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('');
    const form = new FormData(e.currentTarget);
    const patch: Record<string, string> = {
      telegram_chat_id: String(form.get('telegram_chat_id') ?? '').trim(),
      s3_endpoint: String(form.get('s3_endpoint') ?? '').trim(),
      s3_bucket: String(form.get('s3_bucket') ?? '').trim()
    };
    const tt = telegramToken.trim();
    if (tt) patch.telegram_bot_token = tt;
    const ak = s3Access.trim();
    if (ak) patch.s3_access_key = ak;
    const sk = s3Secret.trim();
    if (sk) patch.s3_secret_key = sk;

    try {
      await updateIntegrations(patch);
      setTelegramToken('');
      setS3Access('');
      setS3Secret('');
      const m = await getMe();
      setMe(m);
      setStatus('Settings saved.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function clearTelegram() {
    setStatus('');
    try {
      await updateIntegrations({ telegram_bot_token: '', telegram_chat_id: '' });
      setTelegramToken('');
      const m = await getMe();
      setMe(m);
      setStatus('Telegram disconnected.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to clear Telegram');
    }
  }

  async function clearS3() {
    setStatus('');
    try {
      await updateIntegrations({
        s3_endpoint: '',
        s3_bucket: '',
        s3_access_key: '',
        s3_secret_key: ''
      });
      setS3Access('');
      setS3Secret('');
      const m = await getMe();
      setMe(m);
      setStatus('S3 storage cleared.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to clear S3');
    }
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <Nav />
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <Nav />
          <p className="text-slate-600">Loading your settings…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Nav />

        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Settings</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Everything here is <strong className="font-medium text-slate-800">optional</strong>. Submify works with plain JSON
            form posts only. Add <strong className="font-medium text-slate-800">Telegram</strong> if you want instant
            notifications when someone submits, and <strong className="font-medium text-slate-800">S3-compatible storage</strong>{' '}
            only if you need presigned uploads for large files. Leave secrets blank to keep existing values; use the remove
            buttons to wipe stored credentials.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-6 sm:p-8">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-indigo-900">Before you start</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-indigo-950/90">
            <li>
              After saving, <Link className="font-medium text-brand-700 underline" href="/dashboard">Dashboard</Link> shows
              whether Telegram / S3 is configured (no secrets are shown again).
            </li>
            <li>
              Endpoint URLs for MinIO in Docker are often internal, e.g.{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">http://rustfs:9000</code> — use the hostname your API
              container can reach.
            </li>
          </ul>
        </section>

        <form
          key={`${me.telegram_configured}-${me.s3_configured}-${me.telegram_chat_id}-${me.s3_endpoint}-${me.s3_bucket}`}
          className="space-y-8"
          onSubmit={onSubmit}
        >
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">Telegram notifications</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Status:{' '}
                  <span className={me.telegram_configured ? 'font-semibold text-emerald-700' : 'font-medium text-slate-600'}>
                    {me.telegram_configured ? 'Connected' : 'Not configured'}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                <strong className="text-slate-900">1.</strong> Open Telegram, talk to{' '}
                <strong className="text-slate-900">@BotFather</strong>, run <code className="rounded bg-slate-100 px-1">/newbot</code>, and copy
                the <strong className="text-slate-900">HTTP API token</strong>.
              </p>
              <p>
                <strong className="text-slate-900">2.</strong> Get your <strong className="text-slate-900">chat ID</strong>{' '}
                (e.g. message <code className="rounded bg-slate-100 px-1">@userinfobot</code> or add the bot to a group and use
                a group ID if you prefer).
              </p>
              <p>
                <strong className="text-slate-900">3.</strong> Paste both below and click <em>Save changes</em> at the bottom.
                Leave the token empty if you only want to update the chat ID.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Chat ID</span>
                <input
                  className="w-full rounded-xl border-slate-300 px-4 py-3"
                  name="telegram_chat_id"
                  placeholder="e.g. -1001234567890"
                  defaultValue={me.telegram_chat_id}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Bot token</span>
                <input
                  className="w-full rounded-xl border-slate-300 px-4 py-3"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder={me.telegram_configured ? 'New token (leave blank to keep)' : 'Paste token from BotFather'}
                  type="password"
                  autoComplete="off"
                />
              </label>
            </div>
            <button
              type="button"
              className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={clearTelegram}
            >
              Remove Telegram
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
            <div className="mb-4">
              <h2 className="font-display text-xl font-bold text-slate-900">S3-compatible storage</h2>
              <p className="mt-1 text-sm text-slate-500">
                Status:{' '}
                <span className={me.s3_configured ? 'font-semibold text-emerald-700' : 'font-medium text-slate-600'}>
                  {me.s3_configured ? 'Configured' : 'Not configured'}
                </span>
              </p>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                Use this when you want <strong className="text-slate-900">large file uploads</strong> via presigned URLs.
                Regular small JSON submissions do <strong className="text-slate-900">not</strong> require S3.
              </p>
              <p>
                Enter your <strong className="text-slate-900">endpoint</strong> (MinIO/RustFS/AWS S3 API URL),{' '}
                <strong className="text-slate-900">bucket</strong>, and <strong className="text-slate-900">access key / secret</strong>.
                Match the same region and credentials you use elsewhere.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Endpoint URL</span>
                <input
                  className="w-full rounded-xl border-slate-300 px-4 py-3"
                  name="s3_endpoint"
                  placeholder="https://s3.example.com or http://rustfs:9000"
                  defaultValue={me.s3_endpoint}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Bucket</span>
                <input className="w-full rounded-xl border-slate-300 px-4 py-3" name="s3_bucket" placeholder="Bucket name" defaultValue={me.s3_bucket} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Access key</span>
                <input
                  className="w-full rounded-xl border-slate-300 px-4 py-3"
                  value={s3Access}
                  onChange={(e) => setS3Access(e.target.value)}
                  placeholder={me.s3_configured ? 'Leave blank to keep' : 'Access key'}
                  type="password"
                  autoComplete="off"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Secret key</span>
                <input
                  className="w-full rounded-xl border-slate-300 px-4 py-3"
                  value={s3Secret}
                  onChange={(e) => setS3Secret(e.target.value)}
                  placeholder={me.s3_configured ? 'Leave blank to keep' : 'Secret key'}
                  type="password"
                  autoComplete="off"
                />
              </label>
            </div>
            <button
              type="button"
              className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={clearS3}
            >
              Clear S3 credentials
            </button>
          </section>

          <button type="submit" className="w-full rounded-xl bg-brand-500 py-3.5 text-base font-semibold text-white shadow-lg hover:bg-brand-700 sm:w-auto sm:px-12">
            Save changes
          </button>
        </form>

        {status ? (
          <p
            className={`mt-6 rounded-xl px-4 py-3 text-sm ${
              status.startsWith('Save failed') || status.includes('Failed') ? 'border border-red-200 bg-red-50 text-red-800' : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
            role="status"
          >
            {status}
          </p>
        ) : null}
      </div>
    </main>
  );
}
