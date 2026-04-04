'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../lib/api';

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch(`${API_BASE}/system/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      setError(await res.text());
      return;
    }
    router.push('/login');
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-3xl font-bold">Submify Setup Wizard</h1>
      <p className="mb-6 text-slate-600">First boot detected. Configure storage, telegram, and admin credentials.</p>
      <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        <input name="s3_endpoint" placeholder="S3 endpoint (http://rustfs:9000)" required />
        <input name="s3_bucket" placeholder="S3 bucket" required />
        <input name="s3_access_key" placeholder="S3 access key" required />
        <input name="s3_secret_key" placeholder="S3 secret key" required type="password" />
        <input name="telegram_bot_token" placeholder="Telegram bot token" required />
        <input name="telegram_chat_id" placeholder="Telegram chat ID" required />
        <input name="admin_email" placeholder="Admin email" required type="email" />
        <input name="admin_password" placeholder="Admin password" required type="password" />
        <button className="md:col-span-2" type="submit">Complete Setup</button>
      </form>
      {error && <pre className="mt-4 rounded-md bg-red-100 p-3 text-red-700">{error}</pre>}
    </main>
  );
}
