'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { SubmifyLogo } from '@/components/submify-logo';
import { useRouter } from 'next/navigation';
import { apiBase, userFacingApiError } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    let res: Response;
    try {
      res = await fetch(`${apiBase()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
    } catch {
      setError('Network error. Check your connection and try again.');
      return;
    }

    const text = await res.text();
    if (!res.ok) {
      setError(userFacingApiError(text, res.status));
      return;
    }

    if (!text.trim()) {
      setError('Empty response from server');
      return;
    }

    let data: {
      access_token: string;
      refresh_token: string;
      api_key?: string;
      full_name?: string;
      phone?: string;
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      setError('Invalid response from server');
      return;
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
    <main className="relative min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <div className="mx-auto flex max-w-md flex-col px-6 pb-12 pt-8">
        <div className="mb-8 flex items-center justify-between gap-3 text-sm">
          <Link href="/" className="inline-flex items-center hover:opacity-90" aria-label="Submify home">
            <SubmifyLogo className="h-7 w-auto sm:h-8" />
          </Link>
          <div className="flex gap-3">
            <Link href="/docs" className="font-medium text-slate-600 hover:text-indigo-700">
              Docs
            </Link>
            <Link href="/" className="font-medium text-slate-600 hover:text-indigo-700">
              Home
            </Link>
          </div>
        </div>
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
      </div>
    </main>
  );
}
