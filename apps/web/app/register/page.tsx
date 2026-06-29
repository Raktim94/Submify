'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { SubmifyLogo } from '@/components/submify-logo';
import { useRouter } from 'next/navigation';
import { getBootstrapStatus, registerAccount } from '../../lib/api';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [firstAccount, setFirstAccount] = useState(false);
  const [registrationClosed, setRegistrationClosed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getBootstrapStatus()
      .then((b) => {
        if (cancelled) return;
        if (!b.setup_required) {
          setRegistrationClosed(true);
          setChecking(false);
          return;
        }
        setFirstAccount(true);
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 via-white to-violet-50/40">
        <div className="h-10 w-10 animate-pulse rounded-full bg-indigo-200/80" aria-hidden />
        <span className="sr-only">Loading</span>
      </main>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    const full_name = String(form.get('full_name') ?? '').trim();
    const phone = String(form.get('phone') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    try {
      const data = await registerAccount({ full_name, phone, email, password });
      localStorage.setItem('submify_user_name', data.full_name);
      localStorage.setItem('submify_user_phone', data.phone);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setSubmitting(false);
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

        <Card>
          <h1 className="font-display mb-2 text-3xl font-bold text-slate-900">Create account</h1>

          {registrationClosed ? (
            <>
              <Alert variant="info" className="mt-4">
                This instance already has an account, so public sign-up is closed for security. If you need access, ask
                whoever administers this instance to create your account from <strong>Settings → Team accounts</strong>.
              </Alert>
              <p className="mt-4 text-sm text-slate-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-brand-700 underline">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              {firstAccount ? (
                <Alert variant="info" className="mt-4">
                  You are creating the <strong>first account</strong> for this Submify instance. The password you enter below is
                  the one you will use to sign in — it is not configured via server{' '}
                  <code className="rounded bg-indigo-100/80 px-1 py-0.5 text-xs">.env</code> files. Once this account exists,
                  public sign-up closes and you can invite teammates from Settings.
                </Alert>
              ) : null}

              <p className="mt-4 text-sm text-slate-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-brand-700 underline">
                  Sign in
                </Link>
              </p>

              <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                <Field label="Full name" htmlFor="register-name">
                  <Input id="register-name" name="full_name" placeholder="Jane Doe" required autoComplete="name" />
                </Field>
                <Field label="Mobile number" htmlFor="register-phone">
                  <Input id="register-phone" name="phone" placeholder="+1 555 0100" required type="tel" autoComplete="tel" />
                </Field>
                <Field label="Email" htmlFor="register-email">
                  <Input id="register-email" name="email" placeholder="you@example.com" required type="email" autoComplete="email" />
                </Field>
                <Field label="Password" htmlFor="register-password" hint="Minimum 8 characters">
                  <Input
                    id="register-password"
                    name="password"
                    placeholder="••••••••"
                    required
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                  />
                </Field>
                <Button className="w-full" type="submit" loading={submitting}>
                  Register
                </Button>
              </form>

              {error ? (
                <Alert variant="error" className="mt-4">
                  {error}
                </Alert>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
