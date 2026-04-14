'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Nav } from '../../../../components/nav';
import { api } from '../../../../lib/api';

type Submission = {
  id: string;
  data: unknown;
  files: unknown;
  client_ip?: string;
  user_agent?: string;
  created_at: string;
};

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function SubmissionsPage() {
  const params = useParams<{ id: string }>();
  const projectId = useMemo(() => params.id, [params.id]);
  const [items, setItems] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setError('');
    const data = await api<{ submissions: Submission[] }>(`/projects/${projectId}/submissions?limit=200`);
    setItems(data.submissions);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      load(),
      api<{ projects: { id: string; name: string }[] }>('/projects')
        .then((r) => {
          const p = r.projects.find((x) => x.id === projectId);
          if (p) setProjectName(p.name);
        })
        .catch(() => {})
    ])
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load submissions'))
      .finally(() => setLoading(false));
  }, [projectId, load]);

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
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Nav />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Project inbox</p>
            <h1 className="font-display text-3xl font-bold text-slate-900">
              Submissions{projectName ? ` — ${projectName}` : ''}
            </h1>
          </div>
          <Link
            href="/submissions"
            className="text-sm font-medium text-brand-700 underline decoration-indigo-300 underline-offset-2 hover:text-brand-900"
          >
            All projects
          </Link>
        </div>

        <p className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          Limit is <strong>5,000</strong> submissions per project. Export from{' '}
          <Link href="/export" className="font-medium text-amber-900 underline">
            Export
          </Link>{' '}
          before bulk delete when near the cap.
        </p>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-12">
            <div className="h-10 w-10 animate-pulse rounded-full bg-indigo-200/80" aria-hidden />
            <p className="text-slate-600">Loading submissions…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-red-800" role="alert">
            {error}
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-900 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void bulkDelete()}
                disabled={Object.values(selected).every((v) => !v)}
              >
                Bulk delete selected
              </button>
              <span className="text-sm text-slate-500">
                {items.length} row{items.length === 1 ? '' : 's'} loaded (max 200 per request)
              </span>
            </div>

            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
                <p className="text-slate-700">No submissions yet for this project.</p>
                <p className="mt-2 text-sm text-slate-500">
                  POST JSON to your site&apos;s <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">/api/submit</code>{' '}
                  with header <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">x-api-key</code> set to this
                  project&apos;s public key.
                </p>
                <Link href="/projects" className="mt-6 inline-flex rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                  Back to projects
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-md shadow-slate-200/40"
                  >
                    <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        checked={!!selected[item.id]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      Select for delete
                    </label>
                    <p className="text-xs font-mono text-slate-500">ID: {item.id}</p>
                    <p className="text-xs text-slate-600">{new Date(item.created_at).toLocaleString()}</p>
                    {(item.client_ip || item.user_agent) && (
                      <p className="mt-2 text-xs text-slate-600">
                        {item.client_ip ? `IP: ${item.client_ip}` : ''}
                        {item.client_ip && item.user_agent ? ' · ' : ''}
                        {item.user_agent ? `UA: ${item.user_agent}` : ''}
                      </p>
                    )}
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data</p>
                      <pre className="max-h-64 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">
                        {formatJson(item.data)}
                      </pre>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Files</p>
                      <pre className="max-h-48 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">
                        {formatJson(item.files)}
                      </pre>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
