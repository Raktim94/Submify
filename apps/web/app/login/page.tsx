'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { SubmifyLogo } from '@/components/submify-logo';
import { useRouter } from 'next/navigation';
import { apiBase, getBootstrapStatus, userFacingApiError } from '../../lib/api';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [setupRequired, setSetupRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getBootstrapStatus()
      .then((b) => setSetupRequired(b.setup_required))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
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
      setSubmitting(false);
      return;
    }

    const text = await res.text();
    if (!res.ok) {
      setError(userFacingApiError(text, res.status));
      setSubmitting(false);
      return;
    }

    if (!text.trim()) {
      setError('Empty response from server');
      setSubmitting(false);
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
      setSubmitting(false);
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

        <Card>
          <h1 className="font-display mb-2 text-3xl font-bold text-slate-900">Sign in</h1>

          {setupRequired ? (
            <Alert variant="info" className="mt-4">
              No accounts exist on this instance yet.{' '}
              <Link href="/register" className="font-semibold underline underline-offset-2">
                Create the first account
              </Link>{' '}
              and set your password on that page — not in environment variables.
            </Alert>
          ) : null}

          {setupRequired ? (
            <p className="mt-4 text-sm text-slate-600">
              New here?{' '}
              <Link href="/register" className="font-medium text-brand-700 underline">
                Create an account
              </Link>
            </p>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <Field label="Email" htmlFor="login-email">
              <Input id="login-email" name="email" placeholder="you@example.com" required type="email" autoComplete="email" />
            </Field>
            <Field label="Password" htmlFor="login-password">
              <Input
                id="login-password"
                name="password"
                placeholder="••••••••"
                required
                type="password"
                autoComplete="current-password"
              />
            </Field>
            <Button className="w-full" type="submit" loading={submitting}>
              Sign in
            </Button>
          </form>

          {error ? (
            <Alert variant="error" className="mt-4">
              {error}
            </Alert>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
