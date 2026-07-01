'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { SubmifyLogo } from '@/components/submify-logo';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  portalInfo,
  portalLogin,
  portalLogout,
  portalLookup,
  portalSubmissions,
  portalExport,
  type PortalSubmission
} from '@/lib/portal';
import {
  allDataKeys,
  buildCsv,
  dataAsFlatRecord,
  downloadBlob,
  fieldLabel,
  filesSummary,
  normalizeDataObject,
  safeFileStem,
  sortedDataKeysForRow
} from '@/lib/submissionFormat';

type Phase = 'loading' | 'password' | 'authed' | 'notfound' | 'error';

export default function PortalPage() {
  const params = useParams<{ slug: string }>();
  const slug = useMemo(() => (params.slug ? decodeURIComponent(params.slug) : ''), [params.slug]);

  const [phase, setPhase] = useState<Phase>('loading');
  const [projectName, setProjectName] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState('');
  const [fatalError, setFatalError] = useState('');

  const [items, setItems] = useState<PortalSubmission[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [listError, setListError] = useState('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

  const dataKeys = useMemo(() => allDataKeys(items), [items]);

  const loadSubmissions = useCallback(async () => {
    setLoadingItems(true);
    setListError('');
    try {
      const rows = await portalSubmissions(200);
      setItems(rows);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load submissions');
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const enterAuthed = useCallback(
    async (name: string) => {
      if (name) setProjectName(name);
      setPhase('authed');
      await loadSubmissions();
    },
    [loadSubmissions]
  );

  // Resolve access on load: existing session → view; owner session → auto-enter; else prompt.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await portalInfo();
        if (cancelled) return;
        if (info) {
          await enterAuthed(info.project_name);
          return;
        }
        const lookup = await portalLookup(slug);
        if (cancelled) return;
        if (!lookup) {
          setPhase('notfound');
          return;
        }
        setProjectName(lookup.project_name);
        if (lookup.owner_access) {
          const res = await portalLogin(slug, '');
          if (cancelled) return;
          await enterAuthed(res.project_name);
          return;
        }
        setPhase('password');
      } catch (e) {
        if (cancelled) return;
        setFatalError(e instanceof Error ? e.message : 'Something went wrong');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, enterAuthed]);

  async function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSigningIn(true);
    try {
      const res = await portalLogin(slug, password);
      setPassword('');
      await enterAuthed(res.project_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSigningIn(false);
    }
  }

  async function onSignOut() {
    await portalLogout();
    setItems([]);
    setPassword('');
    setPhase('password');
  }

  function downloadCsv() {
    const csv = buildCsv(items, dataKeys);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `submissions-${safeFileStem(projectName)}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function download(format: 'xlsx' | 'pdf') {
    setExporting(format);
    setListError('');
    try {
      const blob = await portalExport(format);
      downloadBlob(blob, `submissions-${safeFileStem(projectName)}.${format}`);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  // --- Loading / not-found / error states ---
  if (phase === 'loading') {
    return (
      <Shell>
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-12">
          <div className="h-10 w-10 animate-pulse rounded-full bg-indigo-200/80" aria-hidden />
          <p className="text-slate-600">Opening portal…</p>
        </div>
      </Shell>
    );
  }

  if (phase === 'notfound') {
    return (
      <Shell>
        <Card className="text-center">
          <h1 className="font-display text-2xl font-bold text-slate-900">Portal not found</h1>
          <p className="mt-3 text-sm text-slate-600">
            There is no submissions portal at <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">/{slug}</code>. Double-check the
            link your provider shared with you.
          </p>
        </Card>
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-2xl font-bold text-slate-900">Something went wrong</h1>
          <Alert variant="error" className="mt-4">
            {fatalError || 'Please try again later.'}
          </Alert>
        </Card>
      </Shell>
    );
  }

  // --- Password prompt ---
  if (phase === 'password') {
    return (
      <Shell>
        <Card className="mx-auto max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Client portal</p>
          <h1 className="font-display mt-1 text-2xl font-bold text-slate-900">{projectName || 'Submissions'}</h1>
          <p className="mt-2 text-sm text-slate-600">Enter the access password your provider shared with you to view and export submissions.</p>
          <form className="mt-6 space-y-4" onSubmit={onSignIn}>
            <Field label="Access password" htmlFor="portal-password">
              <Input
                id="portal-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Button className="w-full" type="submit" loading={signingIn}>
              View submissions
            </Button>
          </form>
          {error ? (
            <Alert variant="error" className="mt-4">
              {error}
            </Alert>
          ) : null}
        </Card>
      </Shell>
    );
  }

  // --- Authenticated: read-only submissions + export ---
  return (
    <Shell
      right={
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
        >
          Sign out
        </button>
      }
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Client portal</p>
        <h1 className="font-display text-3xl font-bold text-slate-900">{projectName || 'Submissions'}</h1>
        <p className="mt-1 text-sm text-slate-500">Read-only access — view and export submissions.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => void download('xlsx')} loading={exporting === 'xlsx'} disabled={exporting !== null || items.length === 0}>
          Export XLSX
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void download('pdf')}
          loading={exporting === 'pdf'}
          disabled={exporting !== null || items.length === 0}
        >
          Export PDF
        </Button>
        <Button
          size="sm"
          className="bg-emerald-600 from-emerald-600 to-emerald-600 hover:bg-emerald-700"
          onClick={downloadCsv}
          disabled={items.length === 0}
        >
          Download CSV (this page)
        </Button>
        <span className="text-sm text-slate-500">
          {items.length} submission{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {loadingItems ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-12">
          <div className="h-10 w-10 animate-pulse rounded-full bg-indigo-200/80" aria-hidden />
          <p className="text-slate-600">Loading submissions…</p>
        </div>
      ) : listError ? (
        <Alert variant="error">{listError}</Alert>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
          <p className="text-slate-700">No submissions yet.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => {
            const flat = dataAsFlatRecord(item.data);
            const rowKeys = sortedDataKeysForRow(item.data);
            return (
              <li key={item.id} className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/40">
                <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:items-center">
                  <div className="min-w-0 flex-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-1">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted</p>
                      <p className="text-sm font-medium text-slate-800">{new Date(item.created_at).toLocaleString()}</p>
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
    </Shell>
  );
}

function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <div className="mx-auto max-w-[100rem] px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-center justify-between gap-3">
          <span className="inline-flex items-center" aria-label="Submify">
            <SubmifyLogo className="h-7 w-auto sm:h-8" />
          </span>
          {right ?? null}
        </header>
        {children}
      </div>
    </main>
  );
}
