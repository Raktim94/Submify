'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Nav } from '../../../../components/nav';
import { api } from '../../../../lib/api';

type Submission = {
  id: string;
  data: Record<string, unknown>;
  files: unknown[];
  client_ip?: string;
  user_agent?: string;
  created_at: string;
};

export default function SubmissionsPage() {
  const params = useParams<{ id: string }>();
  const projectId = useMemo(() => params.id, [params.id]);
  const [items, setItems] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  async function load() {
    const data = await api<{ submissions: Submission[] }>(`/projects/${projectId}/submissions?limit=200`);
    setItems(data.submissions);
  }

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  async function bulkDelete() {
    const submission_ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (submission_ids.length === 0) return;

    await api(`/projects/${projectId}/submissions/bulk`, {
      method: 'DELETE',
      body: JSON.stringify({ submission_ids })
    });
    setSelected({});
    await load();
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Nav />
      <h1 className="mb-2 text-3xl font-bold">Submissions</h1>
      <p className="mb-4 text-sm text-amber-700">Limit is 5000 submissions per project. Export data before bulk delete when near cap.</p>
      <button className="mb-4" onClick={bulkDelete}>Bulk Delete Selected</button>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg bg-white p-4 shadow">
            <label className="mb-2 inline-flex items-center gap-2 text-sm">
              <input
                checked={!!selected[item.id]}
                onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                type="checkbox"
              />
              Select
            </label>
            <p className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</p>
            {(item.client_ip || item.user_agent) && (
              <p className="mt-1 text-xs text-slate-600">
                {item.client_ip ? `IP: ${item.client_ip}` : ''}
                {item.client_ip && item.user_agent ? ' · ' : ''}
                {item.user_agent ? `UA: ${item.user_agent}` : ''}
              </p>
            )}
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(item.data, null, 2)}</pre>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify(item.files, null, 2)}</pre>
          </div>
        ))}
      </div>
    </main>
  );
}
