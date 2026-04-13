'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBootstrapStatus } from '../lib/api';

export default function HomePage() {
  const router = useRouter();
  const [showGuestHome, setShowGuestHome] = useState(false);

  useEffect(() => {
    (async () => {
      const status = await getBootstrapStatus();
      if (status.setup_required) {
        router.replace('/setup');
        return;
      }
      const token = localStorage.getItem('submify_access_token');
      if (token) {
        router.replace('/dashboard');
        return;
      }
      setShowGuestHome(true);
    })();
  }, [router]);

  if (showGuestHome) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-6 p-8 text-center">
        <h1 className="text-3xl font-bold">Submify</h1>
        <p className="text-slate-600">
          Self-hosted form backend. Sign in to manage projects, API keys, submissions, and exports.
        </p>
        <Link
          href="/login"
          className="inline-flex justify-center rounded-md bg-brand-500 px-4 py-3 font-medium text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return <div className="p-8 text-center text-slate-600">Loading Submify...</div>;
}
