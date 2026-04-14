'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { SubmifyLogo } from '@/components/submify-logo';
import { useRouter } from 'next/navigation';
import { registerAccount } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const full_name = String(form.get('full_name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      const data = await registerAccount({ full_name, phone, email, password });
      localStorage.setItem('submify_access_token', data.access_token);
      localStorage.setItem('submify_refresh_token', data.refresh_token);
      localStorage.setItem('submify_user_name', data.full_name);
      localStorage.setItem('submify_user_phone', data.phone);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-slate-50 via-white to-violet-50/40">
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
      <h1 className="mb-2 text-3xl font-bold">Create account</h1>
      <p className="mb-6 text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-700 underline">
          Sign in
        </Link>
      </p>
      <form className="space-y-3" onSubmit={onSubmit}>
        <input className="w-full" name="full_name" placeholder="Full name" required autoComplete="name" />
        <input className="w-full" name="phone" placeholder="Mobile number" required type="tel" autoComplete="tel" />
        <input className="w-full" name="email" placeholder="Email" required type="email" autoComplete="email" />
        <input
          className="w-full"
          name="password"
          placeholder="Password (min 8 characters)"
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
        />
        <button className="w-full" type="submit">
          Register
        </button>
      </form>
      {error && <pre className="mt-4 whitespace-pre-wrap rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</pre>}
      </div>
    </main>
  );
}
