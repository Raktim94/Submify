'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  buildCsv,
  dataAsFlatRecord,
  downloadBlob,
  fieldLabel,
  filesSummary,
  normalizeDataObject,
  safeFileStem,
  sortedDataKeysForRow
} from '@/lib/submissionFormat';

type Submission = {
  id: string;
  data: unknown;
  files: unknown;
  client_ip?: string;
  user_agent?: string;
  created_at: string;
};


export default function SubmissionsPage() {
  const params = useParams<{ id: string }>();
  const projectId = useMemo(() => params.id, [params.id]);
  const [items, setItems] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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
    setConfirmBulkDelete(false);
    const submission_ids = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (submission_ids.length === 0) return;

    setError('');
    try {
      await api(`/projects/${projectId}/submissions/bulk`, {
        method: 'DELETE',
        body: JSON.stringify({ submission_ids })
      });
      setSelected({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function downloadPageCsv() {
    const csv = buildCsv(items, dataKeys);
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `submissions-${safeFileStem(projectName)}-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  const allSelected =
    items.length > 0 && items.every((i) => selected[i.id]);
  const someSelected = items.some((i) => selected[i.id]);
  const selectedCount = Object.values(selected).filter(Boolean).length;

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
    <>
      <div className="mx-auto max-w-[100rem]">
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
          . The list below shows up to <strong>200</strong> submissions per load; download CSV for this page anytime.
        </p>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-12">
            <div className="h-10 w-10 animate-pulse rounded-full bg-indigo-200/80" aria-hidden />
            <p className="text-slate-600">Loading submissions…</p>
          </div>
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  aria-label="Select all submissions on this page"
                  id="select-all-submissions"
                />
                <label htmlFor="select-all-submissions" className="cursor-pointer select-none">
                  All
                </label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-rose-200 text-rose-900 hover:bg-rose-50"
                onClick={() => setConfirmBulkDelete(true)}
                disabled={!someSelected}
              >
                Bulk delete selected
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 from-emerald-600 to-emerald-600 hover:bg-emerald-700"
                onClick={downloadPageCsv}
                disabled={items.length === 0}
              >
                Download CSV (this page)
              </Button>
              <span className="text-sm text-slate-500">
                {items.length} submission{items.length === 1 ? '' : 's'}
                {dataKeys.length > 0
                  ? ` · ${dataKeys.length} distinct field name${dataKeys.length === 1 ? '' : 's'} in CSV export`
                  : ''}
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
              <ul className="space-y-4">
                {items.map((item) => {
                  const flat = dataAsFlatRecord(item.data);
                  const rowKeys = sortedDataKeysForRow(item.data);
                  return (
                    <li
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/40"
                    >
                      <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:items-center">
                        <input
                          type="checkbox"
                          checked={!!selected[item.id]}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 sm:mt-0"
                          aria-label={`Select submission ${item.id}`}
                        />
                        <div className="min-w-0 flex-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-1">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted</p>
                            <p className="text-sm font-medium text-slate-800">{new Date(item.created_at).toLocaleString()}</p>
                          </div>
                          <div className="mt-2 sm:mt-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">IP</p>
                            <p className="text-sm text-slate-700" title={item.client_ip}>
                              {item.client_ip ?? '—'}
                            </p>
                          </div>
                          <div className="mt-2 sm:mt-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Files</p>
                            <p className="text-sm text-slate-700">{filesSummary(item.files)}</p>
                          </div>
                        </div>
                        <details className="w-full text-sm sm:w-auto sm:min-w-[4rem]">
                          <summary className="cursor-pointer font-medium text-indigo-700 hover:text-indigo-900">Raw JSON</summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100 sm:max-w-md">
                            {JSON.stringify({ data: normalizeDataObject(item.data), files: item.files }, null, 2)}
                          </pre>
                        </details>
                      </div>

                      <div className="px-4 py-4">
                        {rowKeys.length === 0 ? (
                          <p className="text-sm text-slate-500">No form fields in this submission.</p>
                        ) : (
                          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {rowKeys.map((key) => (
                              <div key={key} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fieldLabel(key)}</dt>
                                <dd className="mt-1 break-words text-sm text-slate-900">{flat[key] === '' ? '—' : flat[key]}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selectedCount} submission${selectedCount === 1 ? '' : 's'}?`}
        description="This permanently deletes the selected submissions. This cannot be undone."
        confirmLabel="Delete selected"
        danger
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </>
  );
}
