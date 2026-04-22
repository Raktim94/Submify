'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/nav';
import { changePassword, getMe, rotateAccountAPIKey, rotateAllProjectKeys, updateIntegrations, type MeResponse } from '../../lib/api';

export default function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [telegramToken, setTelegramToken] = useState('');
  const [s3Access, setS3Access] = useState('');
  const [s3Secret, setS3Secret] = useState('');
  const [status, setStatus] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [portStatus, setPortStatus] = useState('');
  const [keyStatus, setKeyStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const [bindIP, setBindIP] = useState('127.0.0.1');
  const [port, setPort] = useState('2512');

  useEffect(() => {
    getMe()
      .then((m) => setMe(m))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load profile'));
  }, []);

  useEffect(() => {
    const savedIP = localStorage.getItem('submify_bind_ip');
    const savedPort = localStorage.getItem('submify_port');
    if (savedIP?.trim()) {
      setBindIP(savedIP.trim());
    }
    if (savedPort?.trim()) {
      setPort(savedPort.trim());
    }
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

  async function onChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordStatus('');
    const form = new FormData(e.currentTarget);
    const currentPassword = String(form.get('current_password') ?? '');
    const newPassword = String(form.get('new_password') ?? '');
    const confirmPassword = String(form.get('confirm_new_password') ?? '');
    if (newPassword.length < 8) {
      setPasswordStatus('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus('New password and confirmation do not match.');
      return;
    }
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      e.currentTarget.reset();
      setPasswordStatus('Password updated successfully.');
    } catch (err) {
      setPasswordStatus(err instanceof Error ? err.message : 'Password update failed');
    }
  }

  function onSavePortPreference() {
    setPortStatus('');
    const normalizedIP = bindIP.trim() || '127.0.0.1';
    const parsedPort = Number(port.trim());
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setPortStatus('Port must be a number between 1 and 65535.');
      return;
    }
    localStorage.setItem('submify_bind_ip', normalizedIP);
    localStorage.setItem('submify_port', String(parsedPort));
    setBindIP(normalizedIP);
    setPort(String(parsedPort));
    setPortStatus('Saved. Apply with the command below and restart containers.');
  }

  async function onRotateAccountKey() {
    setKeyStatus('');
    if (!confirm('Rotate your account API key now? Existing websites using the old key will stop submitting immediately.')) {
      return;
    }
    try {
      const res = await rotateAccountAPIKey();
      const m = await getMe();
      setMe(m);
      setKeyStatus(`Account API key rotated. New key: ${res.api_key}`);
    } catch (err) {
      setKeyStatus(err instanceof Error ? err.message : 'Could not rotate account API key');
    }
  }

  async function onRotateAllProjectKeys() {
    setKeyStatus('');
    if (!confirm('Rotate all project keys? Every old project public/secret key will stop working immediately.')) {
      return;
    }
    const phrase = prompt('Type ROTATE to confirm key rotation for all projects.');
    if (phrase !== 'ROTATE') return;
    try {
      const res = await rotateAllProjectKeys();
      setKeyStatus(`Rotated keys for ${res.projects_rotated} project(s). Update all clients with the new keys from Projects page.`);
    } catch (err) {
      setKeyStatus(err instanceof Error ? err.message : 'Could not rotate project keys');
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
              Endpoint URLs for RustFS in Docker are often internal, e.g.{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">http://rustfs:9000</code> — use the hostname your API
              container can reach.
            </li>
          </ul>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
          <h2 className="font-display text-xl font-bold text-slate-900">Login password</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Change your account password here. This takes effect immediately for future logins.
          </p>
          <form className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onChangePassword}>
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Current password</span>
              <input className="w-full rounded-xl border-slate-300 px-4 py-3" name="current_password" type="password" required autoComplete="current-password" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">New password</span>
              <input className="w-full rounded-xl border-slate-300 px-4 py-3" name="new_password" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Confirm new password</span>
              <input className="w-full rounded-xl border-slate-300 px-4 py-3" name="confirm_new_password" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <button type="submit" className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 md:col-span-2 md:w-fit">
              Update password
            </button>
          </form>
          {passwordStatus ? (
            <p
              className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                passwordStatus.toLowerCase().includes('success')
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border border-red-200 bg-red-50 text-red-800'
              }`}
              role="status"
            >
              {passwordStatus}
            </p>
          ) : null}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
          <h2 className="font-display text-xl font-bold text-slate-900">API key rotation</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Rotate exposed keys immediately if you suspect leakage. Rotating invalidates old keys right away.
          </p>
          <div className="mt-4 grid gap-3">
            <button
              type="button"
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 sm:w-fit"
              onClick={onRotateAccountKey}
            >
              Rotate account API key
            </button>
            <button
              type="button"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-900 hover:bg-rose-100 sm:w-fit"
              onClick={onRotateAllProjectKeys}
            >
              Rotate all project keys
            </button>
            <p className="text-xs text-slate-600">
              Per-project key rotation is also available from <Link href="/projects" className="font-medium text-brand-700 underline">Projects</Link>.
            </p>
          </div>
          {keyStatus ? (
            <p
              className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                keyStatus.toLowerCase().includes('rotated')
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border border-red-200 bg-red-50 text-red-800'
              }`}
              role="status"
            >
              {keyStatus}
            </p>
          ) : null}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
          <h2 className="font-display text-xl font-bold text-slate-900">Local port and bind address</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Default is <code className="rounded bg-slate-100 px-1">127.0.0.1:2512</code> for safer local-only access. Keep this when using Cloudflare Tunnel.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Bind IP</span>
              <input className="w-full rounded-xl border-slate-300 px-4 py-3" value={bindIP} onChange={(e) => setBindIP(e.target.value)} placeholder="127.0.0.1" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-600">Port</span>
              <input className="w-full rounded-xl border-slate-300 px-4 py-3" value={port} onChange={(e) => setPort(e.target.value)} placeholder="2512" inputMode="numeric" />
            </label>
          </div>
          <button
            type="button"
            className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={onSavePortPreference}
          >
            Save local preference
          </button>
          <p className="mt-4 text-xs text-slate-600">
            Apply on host (PowerShell):{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5">
              $env:SUBMIFY_BIND_IP='{bindIP.trim() || '127.0.0.1'}'; $env:SUBMIFY_PORT='{port.trim() || '2512'}'; .\scripts\Compose-Up.ps1 up -d
            </code>
          </p>
          {portStatus ? (
            <p
              className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                portStatus.startsWith('Saved')
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border border-red-200 bg-red-50 text-red-800'
              }`}
              role="status"
            >
              {portStatus}
            </p>
          ) : null}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
          <h2 className="font-display text-xl font-bold text-slate-900">RustFS root password (host-level)</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            The RustFS root password is a Docker runtime secret (<code className="rounded bg-slate-100 px-1">RUSTFS_ROOT_PASSWORD</code>).
            It is not changed from the web UI by design.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            To rotate safely: update <code className="rounded bg-slate-100 px-1">.env</code> (or <code className="rounded bg-slate-100 px-1">.env.auto</code>),
            then restart with <code className="rounded bg-slate-100 px-1">.\scripts\Compose-Up.ps1 up -d</code>. After rotating, update S3 access/secret credentials above if they changed.
          </p>
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
                Enter your <strong className="text-slate-900">endpoint</strong> (RustFS/AWS S3 API URL),{' '}
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
