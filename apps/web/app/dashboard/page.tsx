'use client';

import { useEffect, useState } from 'react';
import { Nav } from '../../components/nav';
import { api } from '../../lib/api';

export default function DashboardPage() {
  const [health, setHealth] = useState<any>(null);
  const [update, setUpdate] = useState<any>(null);

  useEffect(() => {
    api('/system/health').then(setHealth).catch(() => setHealth({ status: 'degraded' }));
    api('/system/update-status').then(setUpdate).catch(() => setUpdate({ update_available: false }));
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Nav />
      <h1 className="mb-4 text-3xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg bg-white p-4 shadow">
          <h2 className="font-semibold">System Health</h2>
          <pre className="mt-2 text-sm">{JSON.stringify(health, null, 2)}</pre>
        </section>
        <section className="rounded-lg bg-white p-4 shadow">
          <h2 className="font-semibold">Updates</h2>
          <pre className="mt-2 text-sm">{JSON.stringify(update, null, 2)}</pre>
          <button
            className="mt-3"
            onClick={async () => {
              await api('/system/update-trigger', { method: 'POST' });
              alert('Update trigger requested.');
            }}
          >
            Pull & Restart
          </button>
        </section>
      </div>
    </main>
  );
}
