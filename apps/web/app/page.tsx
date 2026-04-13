'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('submify_access_token');
    if (token) {
      router.replace('/dashboard');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return <div className="p-8 text-center text-slate-600">Loading…</div>;
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Submify</h1>
        <p className="mt-3 text-lg text-slate-600">
          Self-hosted form backend: collect submissions from your sites, review them in a dashboard, export to Excel or PDF,
          and optionally wire Telegram alerts or S3-compatible storage for large uploads.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">How it works</h2>
        <ul className="mt-4 list-inside list-disc space-y-2 text-slate-600">
          <li>
            <strong className="font-medium text-slate-800">Register</strong> with your name, mobile number, email, and a
            password (at least 8 characters).
          </li>
          <li>
            After sign-in, your <strong className="font-medium text-slate-800">dashboard</strong> gives you an API key for
            embedding forms. Each project keeps up to <strong className="font-medium text-slate-800">5000</strong>{' '}
            submissions—you can list them, export, or bulk delete to free space.
          </li>
          <li>
            <strong className="font-medium text-slate-800">Telegram</strong> (optional): add a bot token and chat ID in
            Settings to receive real-time notifications when forms are submitted. Leave them empty if you do not need alerts.
          </li>
          <li>
            <strong className="font-medium text-slate-800">S3-compatible storage</strong> (optional): configure endpoint,
            bucket, and keys in Settings when you need presigned uploads for large files. Without it, small JSON submissions
            still work; large-file upload helpers stay disabled until you configure storage.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/register"
          className="inline-flex min-w-[10rem] justify-center rounded-md bg-brand-500 px-6 py-3 font-medium text-white hover:bg-brand-700"
        >
          Create account
        </Link>
        <Link
          href="/login"
          className="inline-flex min-w-[10rem] justify-center rounded-md border border-slate-300 bg-white px-6 py-3 font-medium text-slate-800 hover:bg-slate-50"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
