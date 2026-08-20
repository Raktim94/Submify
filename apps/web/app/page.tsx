'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SubmifyLogo } from '@/components/submify-logo';
import { Card } from '@/components/ui/card';
import { getBootstrapStatus, isSessionValid } from '@/lib/api';

const primaryButton =
  'inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:shadow-lg';
const outlineButton =
  'inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50';

const GITHUB_REPO = 'https://github.com/Raktim94/Submify';
const SUPPORT_URL = 'https://www.nodedr.com/contactus';

type Status = 'loading' | 'signed-in' | 'setup-required' | 'signed-out';

export default function HomePage() {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isSessionValid();
      if (cancelled) return;
      if (ok) {
        setStatus('signed-in');
        return;
      }
      try {
        const b = await getBootstrapStatus();
        if (!cancelled) setStatus(b.setup_required ? 'setup-required' : 'signed-out');
      } catch {
        if (!cancelled) setStatus('signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-8">
        <div className="mb-10 flex items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center" aria-hidden>
            <SubmifyLogo className="h-7 w-auto sm:h-8" priority />
          </span>
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-500 hover:text-indigo-700"
          >
            GitHub
          </a>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <Card className="text-center">
            <SubmifyLogo className="mx-auto h-10 w-auto" />
            <p className="mt-5 text-sm leading-relaxed text-slate-600">
              Self-hosted form backend — your submissions, your database, your rules.
            </p>

            <div className="mt-7 flex flex-col gap-3">
              {status === 'loading' ? (
                <>
                  <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-11 w-2/3 animate-pulse self-center rounded-xl bg-slate-100" />
                </>
              ) : status === 'signed-in' ? (
                <Link href="/dashboard" className={primaryButton}>
                  Open dashboard
                </Link>
              ) : status === 'setup-required' ? (
                <>
                  <Link href="/register" className={primaryButton}>
                    Create the first account
                  </Link>
                  <Link href="/login" className={outlineButton}>
                    Sign in
                  </Link>
                </>
              ) : (
                <Link href="/login" className={primaryButton}>
                  Sign in
                </Link>
              )}
            </div>
          </Card>

          <p className="mt-6 text-center text-xs text-slate-500">
            Self-hosting for the first time?{' '}
            <a href={`${GITHUB_REPO}#readme`} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 hover:underline">
              One-command install on GitHub
            </a>
            .
          </p>
        </div>

        <footer className="mt-10 border-t border-slate-200/80 pt-6 text-center text-xs text-slate-500">
          <p>
            Made by <span className="font-medium text-slate-700">NODEDR INFOTECH PRIVATE LIMITED</span>
          </p>
          <p className="mt-2">
            <a
              href={`${GITHUB_REPO}#readme`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              Documentation
            </a>{' '}
            ·{' '}
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline">
              Support
            </a>{' '}
            ·{' '}
            <a
              href="https://www.nodedr.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              www.nodedr.com
            </a>
          </p>
          <p className="mt-2 text-slate-400">Copyright © {new Date().getFullYear()} NODEDR INFOTECH PRIVATE LIMITED.</p>
        </footer>
      </div>
    </main>
  );
}
