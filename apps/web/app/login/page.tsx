'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      setError(await res.text());
      return;
    }

    const data = await res.json();
    localStorage.setItem('submify_access_token', data.access_token);
    localStorage.setItem('submify_refresh_token', data.refresh_token);
    if (typeof data.api_key === 'string') {
      localStorage.setItem('submify_user_api_key', data.api_key);
    }
    router.push('/dashboard');
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-3xl font-bold">Submify Login</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input className="w-full" name="email" placeholder="Email" required type="email" />
        <input className="w-full" name="password" placeholder="Password" required type="password" />
        <button className="w-full" type="submit">Sign In</button>
      </form>
      {error && <pre className="mt-4 rounded-md bg-red-100 p-3 text-red-700">{error}</pre>}
    </main>
  );
}
