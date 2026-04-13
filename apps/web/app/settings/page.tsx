'use client';

import { FormEvent, useEffect, useState } from 'react';
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
      .then((m) => {
        setMe(m);
      })
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
      <main className="mx-auto max-w-4xl p-6">
        <Nav />
        <p className="text-red-700">{loadError}</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <Nav />
        <p className="text-slate-600">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Nav />
      <h1 className="mb-2 text-3xl font-bold">Settings</h1>
      <p className="mb-6 text-slate-600">
        Telegram and S3 are optional. Add them when you want chat notifications or presigned uploads for large files; leave
        fields empty otherwise. Secret fields left blank keep your existing stored values.
      </p>

      <form
        key={`${me.telegram_configured}-${me.s3_configured}-${me.telegram_chat_id}-${me.s3_endpoint}-${me.s3_bucket}`}
        className="space-y-8"
        onSubmit={onSubmit}
      >
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Telegram (optional)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Status: {me.telegram_configured ? 'configured' : 'not configured'}. Paste a bot token from BotFather and your
            chat ID to receive submission alerts.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              className="w-full"
              name="telegram_chat_id"
              placeholder="Telegram chat ID"
              defaultValue={me.telegram_chat_id}
            />
            <input
              className="w-full"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder={me.telegram_configured ? 'New bot token (leave blank to keep)' : 'Telegram bot token'}
              type="password"
              autoComplete="off"
            />
          </div>
          <button type="button" className="mt-3 bg-slate-600 hover:bg-slate-800" onClick={clearTelegram}>
            Remove Telegram
          </button>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">S3-compatible storage (optional)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Status: {me.s3_configured ? 'configured' : 'not configured'}. Needed for large presigned uploads; standard JSON
            submissions work without this.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              className="w-full"
              name="s3_endpoint"
              placeholder="S3 endpoint (e.g. http://rustfs:9000)"
              defaultValue={me.s3_endpoint}
            />
            <input className="w-full" name="s3_bucket" placeholder="Bucket name" defaultValue={me.s3_bucket} />
            <input
              className="w-full"
              value={s3Access}
              onChange={(e) => setS3Access(e.target.value)}
              placeholder={me.s3_configured ? 'Access key (leave blank to keep)' : 'Access key'}
              type="password"
              autoComplete="off"
            />
            <input
              className="w-full"
              value={s3Secret}
              onChange={(e) => setS3Secret(e.target.value)}
              placeholder={me.s3_configured ? 'Secret key (leave blank to keep)' : 'Secret key'}
              type="password"
              autoComplete="off"
            />
          </div>
          <button type="button" className="mt-3 bg-slate-600 hover:bg-slate-800" onClick={clearS3}>
            Clear S3 credentials
          </button>
        </section>

        <button type="submit" className="w-full md:w-auto">
          Save changes
        </button>
      </form>

      {status && (
        <p
          className={`mt-4 rounded p-3 text-sm ${
            status.startsWith('Save failed') || status.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {status}
        </p>
      )}
    </main>
  );
}
