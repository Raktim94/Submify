'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/nav';
import {
  changePassword,
  createUser,
  deleteUser,
  getMe,
  listUsers,
  rotateAccountAPIKey,
  rotateAllProjectKeys,
  updateIntegrations,
  type AccountUser,
  type MeResponse
} from '../../lib/api';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

function StatusMessage({ message, isError }: { message: string; isError: boolean }) {
  return (
    <Alert variant={isError ? 'error' : 'success'} className="mt-4">
      {message}
    </Alert>
  );
}

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
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [confirmRotateAccount, setConfirmRotateAccount] = useState(false);
  const [confirmRotateProjects, setConfirmRotateProjects] = useState(false);
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [usersStatus, setUsersStatus] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AccountUser | null>(null);

  useEffect(() => {
    getMe()
      .then((m) => setMe(m))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load profile'));
  }, []);

  useEffect(() => {
    if (!me?.is_admin) return;
    listUsers()
      .then((res) => setUsers(res.users))
      .catch((e) => setUsersStatus(e instanceof Error ? e.message : 'Failed to load accounts'));
  }, [me?.is_admin]);

  async function onCreateUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUsersStatus('');
    const form = new FormData(e.currentTarget);
    const full_name = String(form.get('new_user_full_name') ?? '').trim();
    const phone = String(form.get('new_user_phone') ?? '').trim();
    const email = String(form.get('new_user_email') ?? '').trim();
    const password = String(form.get('new_user_password') ?? '');
    if (password.length < 8) {
      setUsersStatus('Password must be at least 8 characters.');
      return;
    }
    setCreatingUser(true);
    try {
      await createUser({ full_name, phone, email, password });
      e.currentTarget.reset();
      const res = await listUsers();
      setUsers(res.users);
      setUsersStatus(`Account created for ${email}. Share the password with them directly — it is not emailed.`);
    } catch (err) {
      setUsersStatus(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setCreatingUser(false);
    }
  }

  async function onDeleteUser() {
    if (!confirmDeleteUser) return;
    const target = confirmDeleteUser;
    setConfirmDeleteUser(null);
    setUsersStatus('');
    try {
      await deleteUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      setUsersStatus(`Removed ${target.email}.`);
    } catch (err) {
      setUsersStatus(err instanceof Error ? err.message : 'Could not remove account');
    }
  }

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
    setSavingSettings(true);
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
    } finally {
      setSavingSettings(false);
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
    setSavingPassword(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      e.currentTarget.reset();
      setPasswordStatus('Password updated successfully.');
    } catch (err) {
      setPasswordStatus(err instanceof Error ? err.message : 'Password update failed');
    } finally {
      setSavingPassword(false);
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
    setConfirmRotateAccount(false);
    setKeyStatus('');
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
    setConfirmRotateProjects(false);
    setKeyStatus('');
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
          <Alert variant="error">{loadError}</Alert>
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
              For remote object storage providers (AWS S3, Cloudflare R2, Wasabi, MinIO), use the endpoint your API
              container can reach.
            </li>
          </ul>
        </section>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Login password</CardTitle>
            <CardDescription>Change your account password here. This takes effect immediately for future logins.</CardDescription>
          </CardHeader>
          <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onChangePassword}>
            <div className="md:col-span-2">
              <Field label="Current password" htmlFor="current_password">
                <Input id="current_password" name="current_password" type="password" required autoComplete="current-password" />
              </Field>
            </div>
            <Field label="New password" htmlFor="new_password">
              <Input id="new_password" name="new_password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm_new_password">
              <Input id="confirm_new_password" name="confirm_new_password" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Button type="submit" loading={savingPassword} className="md:col-span-2 md:w-fit">
              Update password
            </Button>
          </form>
          {passwordStatus ? (
            <StatusMessage message={passwordStatus} isError={!passwordStatus.toLowerCase().includes('success')} />
          ) : null}
        </Card>

        {me.is_admin ? (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Team accounts</CardTitle>
              <CardDescription>
                Public sign-up is closed on this instance for security. As the admin, you can create additional accounts here
                for teammates — each gets their own login and projects, separate from yours.
              </CardDescription>
            </CardHeader>

            {users.length > 0 ? (
              <ul className="mb-6 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {u.full_name || u.email} {u.is_admin ? <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">Admin</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                    {!u.is_admin ? (
                      <Button variant="danger" className="text-xs" onClick={() => setConfirmDeleteUser(u)}>
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onCreateUser}>
              <Field label="Full name" htmlFor="new_user_full_name">
                <Input id="new_user_full_name" name="new_user_full_name" required autoComplete="off" />
              </Field>
              <Field label="Mobile number" htmlFor="new_user_phone">
                <Input id="new_user_phone" name="new_user_phone" type="tel" required autoComplete="off" />
              </Field>
              <Field label="Email" htmlFor="new_user_email">
                <Input id="new_user_email" name="new_user_email" type="email" required autoComplete="off" />
              </Field>
              <Field label="Initial password" htmlFor="new_user_password" hint="Minimum 8 characters">
                <Input id="new_user_password" name="new_user_password" type="password" required minLength={8} autoComplete="new-password" />
              </Field>
              <Button type="submit" loading={creatingUser} className="md:col-span-2 md:w-fit">
                Create account
              </Button>
            </form>
            {usersStatus ? (
              <StatusMessage message={usersStatus} isError={!/^(Account created|Removed)/.test(usersStatus)} />
            ) : null}
          </Card>
        ) : null}

        <ConfirmDialog
          open={Boolean(confirmDeleteUser)}
          title={`Remove ${confirmDeleteUser?.email ?? 'this account'}?`}
          description="Their projects and submissions are deleted right away; any active session expires shortly after."
          confirmLabel="Remove account"
          danger
          onConfirm={onDeleteUser}
          onCancel={() => setConfirmDeleteUser(null)}
        />

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>API key rotation</CardTitle>
            <CardDescription>Rotate exposed keys immediately if you suspect leakage. Rotating invalidates old keys right away.</CardDescription>
          </CardHeader>
          <div className="grid gap-3">
            <Button variant="outline" className="sm:w-fit" onClick={() => setConfirmRotateAccount(true)}>
              Rotate account API key
            </Button>
            <Button variant="danger" className="sm:w-fit" onClick={() => setConfirmRotateProjects(true)}>
              Rotate all project keys
            </Button>
            <p className="text-xs text-slate-600">
              Per-project key rotation is also available from <Link href="/projects" className="font-medium text-brand-700 underline">Projects</Link>.
            </p>
          </div>
          {keyStatus ? <StatusMessage message={keyStatus} isError={!keyStatus.toLowerCase().includes('rotated')} /> : null}
        </Card>

        <ConfirmDialog
          open={confirmRotateAccount}
          title="Rotate account API key?"
          description="Existing websites using the old key will stop submitting immediately."
          confirmLabel="Rotate key"
          onConfirm={onRotateAccountKey}
          onCancel={() => setConfirmRotateAccount(false)}
        />
        <ConfirmDialog
          open={confirmRotateProjects}
          title="Rotate all project keys?"
          description="Every old project public/secret key will stop working immediately."
          confirmText="ROTATE"
          confirmLabel="Rotate all keys"
          danger
          onConfirm={onRotateAllProjectKeys}
          onCancel={() => setConfirmRotateProjects(false)}
        />

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Local port and bind address</CardTitle>
            <CardDescription>
              Default is <code className="rounded bg-slate-100 px-1">127.0.0.1:2512</code> for safer local-only access. Keep this
              when using Cloudflare Tunnel.
            </CardDescription>
          </CardHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Bind IP" htmlFor="bind_ip">
              <Input id="bind_ip" value={bindIP} onChange={(e) => setBindIP(e.target.value)} placeholder="127.0.0.1" />
            </Field>
            <Field label="Port" htmlFor="bind_port">
              <Input id="bind_port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="2512" inputMode="numeric" />
            </Field>
          </div>
          <Button variant="outline" className="mt-4" onClick={onSavePortPreference}>
            Save local preference
          </Button>
          <p className="mt-4 text-xs text-slate-600">
            Apply on host (PowerShell):{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5">
              $env:SUBMIFY_BIND_IP=&apos;{bindIP.trim() || '127.0.0.1'}&apos;; $env:SUBMIFY_PORT=&apos;{port.trim() || '2512'}&apos;;
              .\scripts\Compose-Up.ps1 up -d
            </code>
          </p>
          {portStatus ? <StatusMessage message={portStatus} isError={!portStatus.startsWith('Saved')} /> : null}
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Remote storage credentials</CardTitle>
            <CardDescription>Storage keys are managed by your external provider and are not generated by this app.</CardDescription>
          </CardHeader>
          <p className="text-sm leading-relaxed text-slate-700">
            To rotate safely, create new provider keys first, update them here, test presigned uploads, then revoke old keys in
            your provider console.
          </p>
        </Card>

        <form
          key={`${me.telegram_configured}-${me.s3_configured}-${me.telegram_chat_id}-${me.s3_endpoint}-${me.s3_bucket}`}
          className="space-y-8"
          onSubmit={onSubmit}
        >
          <Card>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Telegram notifications</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Status:{' '}
                  <span className={me.telegram_configured ? 'font-semibold text-emerald-700' : 'font-medium text-slate-600'}>
                    {me.telegram_configured ? 'Connected' : 'Not configured'}
                  </span>
                </p>
              </div>
            </div>
            <div className="mb-6 space-y-3 text-sm leading-relaxed text-slate-700">
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Chat ID" htmlFor="telegram_chat_id">
                <Input id="telegram_chat_id" name="telegram_chat_id" placeholder="e.g. -1001234567890" defaultValue={me.telegram_chat_id} />
              </Field>
              <Field label="Bot token" htmlFor="telegram_bot_token">
                <Input
                  id="telegram_bot_token"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder={me.telegram_configured ? 'New token (leave blank to keep)' : 'Paste token from BotFather'}
                  type="password"
                  autoComplete="off"
                />
              </Field>
            </div>
            <Button type="button" variant="outline" className="mt-4" onClick={clearTelegram}>
              Remove Telegram
            </Button>
          </Card>

          <Card>
            <div className="mb-4">
              <CardTitle>S3-compatible storage</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Status:{' '}
                <span className={me.s3_configured ? 'font-semibold text-emerald-700' : 'font-medium text-slate-600'}>
                  {me.s3_configured ? 'Configured' : 'Not configured'}
                </span>
              </p>
            </div>
            <div className="mb-6 space-y-3 text-sm leading-relaxed text-slate-700">
              <p>
                Use this when you want <strong className="text-slate-900">large file uploads</strong> via presigned URLs.
                Regular small JSON submissions do <strong className="text-slate-900">not</strong> require S3.
              </p>
              <p>
                Enter your <strong className="text-slate-900">endpoint</strong> (AWS S3 or any S3-compatible API URL),{' '}
                <strong className="text-slate-900">bucket</strong>, and <strong className="text-slate-900">access key / secret</strong>.
                Match the same region and credentials you use elsewhere.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Endpoint URL" htmlFor="s3_endpoint">
                  <Input id="s3_endpoint" name="s3_endpoint" placeholder="https://s3.your-provider.com" defaultValue={me.s3_endpoint} />
                </Field>
              </div>
              <Field label="Bucket" htmlFor="s3_bucket">
                <Input id="s3_bucket" name="s3_bucket" placeholder="Bucket name" defaultValue={me.s3_bucket} />
              </Field>
              <Field label="Access key" htmlFor="s3_access_key">
                <Input
                  id="s3_access_key"
                  value={s3Access}
                  onChange={(e) => setS3Access(e.target.value)}
                  placeholder={me.s3_configured ? 'Leave blank to keep' : 'Access key'}
                  type="password"
                  autoComplete="off"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Secret key" htmlFor="s3_secret_key">
                  <Input
                    id="s3_secret_key"
                    value={s3Secret}
                    onChange={(e) => setS3Secret(e.target.value)}
                    placeholder={me.s3_configured ? 'Leave blank to keep' : 'Secret key'}
                    type="password"
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>
            <Button type="button" variant="outline" className="mt-4" onClick={clearS3}>
              Clear S3 credentials
            </Button>
          </Card>

          <Button type="submit" loading={savingSettings} className="w-full sm:w-auto sm:px-12">
            Save changes
          </Button>
        </form>

        {status ? <StatusMessage message={status} isError={status.includes('Failed') || status.startsWith('Save failed')} /> : null}
      </div>
    </main>
  );
}
