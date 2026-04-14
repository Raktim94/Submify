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

/** Normalize API `data` to flat string map for table cells. */
function dataAsFlatRecord(data: unknown): Record<string, string> {
  const raw = normalizeDataObject(data);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = cellString(v);
  }
  return out;
}

function normalizeDataObject(data: unknown): Record<string, unknown> {
  if (data === null || data === undefined) return {};
  if (typeof data === 'string') {
    try {
      const p = JSON.parse(data) as unknown;
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      return { message: data };
    }
    return {};
  }
  if (typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return { value: data };
}

function cellString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function filesSummary(files: unknown): string {
  if (files === null || files === undefined) return '';
  if (Array.isArray(files)) return files.length === 0 ? '—' : `${files.length} file(s)`;
  return cellString(files);
}

function buildCsv(items: Submission[], dataKeys: string[]): string {
  const baseCols = ['submitted_at', 'submission_id', 'client_ip', 'user_agent'];
  const cols = [...baseCols, ...dataKeys, 'files'];

  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

  const lines: string[] = [];
  lines.push(cols.map(esc).join(','));

  for (const item of items) {
    const d = dataAsFlatRecord(item.data);
    const row = cols.map((c) => {
      if (c === 'submitted_at') return new Date(item.created_at).toISOString();
      if (c === 'submission_id') return item.id;
      if (c === 'client_ip') return item.client_ip ?? '';
      if (c === 'user_agent') return item.user_agent ?? '';
      if (c === 'files') return filesSummary(item.files);
      return d[c] ?? '';
    });
    lines.push(row.map(esc).join(','));
  }

  return '\uFEFF' + lines.join('\n');
}

export default function SubmissionsPage() {
  const params = useParams<{ id: string }>();
  const projectId = useMemo(() => params.id, [params.id]);
  const [items, setItems] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');

  const dataKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of items) {
      Object.keys(dataAsFlatRecord(item.data)).forEach((k) => keys.add(k));
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [items]);

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

  function downloadPageCsv() {
    const csv = buildCsv(items, dataKeys);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const safeName = (projectName || 'project').replace(/[^\w\-]+/g, '_').slice(0, 40);
    a.download = `submissions-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const allSelected =
    items.length > 0 && items.every((i) => selected[i.id]);
  const someSelected = items.some((i) => selected[i.id]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      items.forEach((i) => {
        next[i.id] = true;
      });
      setSelected(next);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <div className="mx-auto max-w-[100rem] px-4 py-8 sm:px-6">
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
          Limit is <strong>5,000</strong> submissions per project. For full exports (XLSX/PDF) use{' '}
          <Link href="/export" className="font-medium text-amber-900 underline">
            Export
          </Link>
          . The table below shows up to <strong>200</strong> rows per load; download CSV for this page anytime.
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
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-900 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void bulkDelete()}
                disabled={!someSelected}
              >
                Bulk delete selected
              </button>
              <button
                type="button"
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={downloadPageCsv}
                disabled={items.length === 0}
              >
                Download CSV (this page)
              </button>
              <span className="text-sm text-slate-500">
                {items.length} row{items.length === 1 ? '' : 's'} · {dataKeys.length} field column{dataKeys.length === 1 ? '' : 's'}
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
                <Link
                  href="/projects"
                  className="mt-6 inline-flex rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Back to projects
                </Link>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-200/50">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="w-10 border-r border-slate-200 bg-slate-50 px-2 py-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600"
                            aria-label="Select all"
                          />
                        </th>
                        <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">Submitted</th>
                        <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">IP</th>
                        {dataKeys.map((key) => (
                          <th key={key} className="min-w-[8rem] whitespace-nowrap px-3 py-3 font-semibold text-slate-800">
                            {key}
                          </th>
                        ))}
                        <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">Files</th>
                        <th className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">Raw</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const flat = dataAsFlatRecord(item.data);
                        return (
                          <tr key={item.id} className="border-b border-slate-100 hover:bg-indigo-50/40">
                            <td className="border-r border-slate-100 bg-white px-2 py-2 align-top">
                              <input
                                type="checkbox"
                                checked={!!selected[item.id]}
                                onChange={(e) =>
                                  setSelected((prev) => ({ ...prev, [item.id]: e.target.checked }))
                                }
                                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                                aria-label={`Select ${item.id}`}
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 align-top text-slate-700">
                              {new Date(item.created_at).toLocaleString()}
                            </td>
                            <td className="max-w-[9rem] truncate px-3 py-2 align-top text-slate-600" title={item.client_ip}>
                              {item.client_ip ?? '—'}
                            </td>
                            {dataKeys.map((key) => (
                              <td key={key} className="max-w-[14rem] px-3 py-2 align-top text-slate-800">
                                <span className="line-clamp-4 break-words" title={flat[key]}>
                                  {flat[key] === '' ? '—' : flat[key]}
                                </span>
                              </td>
                            ))}
                            <td className="whitespace-nowrap px-3 py-2 align-top text-slate-600">{filesSummary(item.files)}</td>
                            <td className="px-2 py-1 align-top">
                              <details className="text-xs">
                                <summary className="cursor-pointer font-medium text-indigo-700 hover:text-indigo-900">
                                  JSON
                                </summary>
                                <pre className="mt-2 max-h-48 max-w-xs overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100">
                                  {JSON.stringify({ data: normalizeDataObject(item.data), files: item.files }, null, 2)}
                                </pre>
                              </details>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
