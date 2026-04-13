'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
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
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { error?: string };
        setError(j.error ?? text);
      } catch {
        setError(text);
      }
      return;
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      api_key?: string;
      full_name?: string;
      phone?: string;
    };
    localStorage.setItem('submify_access_token', data.access_token);
    localStorage.setItem('submify_refresh_token', data.refresh_token);
    if (typeof data.api_key === 'string') {
      localStorage.setItem('submify_user_api_key', data.api_key);
    }
    if (typeof data.full_name === 'string') {
      localStorage.setItem('submify_user_name', data.full_name);
    }
    if (typeof data.phone === 'string') {
      localStorage.setItem('submify_user_phone', data.phone);
    }
    router.push('/dashboard');
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-3xl font-bold">Sign in</h1>
      <p className="mb-6 text-slate-600">
        New here?{' '}
        <Link href="/register" className="text-brand-700 underline">
          Create an account
        </Link>
      </p>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input className="w-full" name="email" placeholder="Email" required type="email" autoComplete="email" />
        <input className="w-full" name="password" placeholder="Password" required type="password" autoComplete="current-password" />
        <button className="w-full" type="submit">
          Sign in
        </button>
      </form>
      {error && <pre className="mt-4 whitespace-pre-wrap rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</pre>}
    </main>
  );
}
