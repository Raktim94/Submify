'use client';

import { FormEvent, useState } from 'react';
import { Nav } from '../../components/nav';
import { api } from '../../lib/api';

export default function SettingsPage() {
  const [status, setStatus] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('');
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    await api('/system/config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    setStatus('Saved. Runtime config is reloaded without restart.');
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Nav />
      <h1 className="mb-4 text-3xl font-bold">Settings</h1>
      <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <input name="s3_endpoint" placeholder="S3 endpoint" required />
        <input name="s3_bucket" placeholder="S3 bucket" required />
        <input name="s3_access_key" placeholder="S3 access key" required />
        <input name="s3_secret_key" placeholder="S3 secret key" required />
        <input name="telegram_bot_token" placeholder="Telegram token" required />
        <input name="telegram_chat_id" placeholder="Telegram chat id" required />
        <button className="md:col-span-2" type="submit">Save Settings</button>
      </form>
      {status && <p className="mt-4 rounded bg-emerald-100 p-3 text-emerald-700">{status}</p>}
    </main>
  );
}
