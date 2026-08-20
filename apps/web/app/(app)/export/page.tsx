'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, apiBase, userFacingApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

type Project = { id: string; name: string };

export default function ExportPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ projects: Project[] }>('/projects')
      .then((data) => {
        setProjects(data.projects);
        if (data.projects[0]) setProjectId(data.projects[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load projects'))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!projectId) {
      setError('Choose a project first.');
      return;
    }
    const form = new FormData(e.currentTarget);
    const format = form.get('format') as string;
    const res = await fetch(`${apiBase()}/projects/${projectId}/export?format=${format}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const t = await res.text();
      setError(userFacingApiError(t, res.status));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submissions.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Export</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Download <strong className="font-medium text-slate-800">all submissions</strong> for one project as a spreadsheet
            or PDF. You must stay logged in — the browser sends your session token. For very large inboxes, consider exporting
            before bulk-deleting old rows so you stay under the{' '}
            <strong className="font-medium text-slate-800">5,000</strong> row limit per project.
          </p>
        </header>

        <Card className="mb-8">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-slate-600">Steps</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700 marker:text-brand-600 sm:text-base">
            <li>
              Select the <strong className="text-slate-900">project</strong> whose rows you want (same list as on{' '}
              <Link className="font-medium text-brand-700 underline" href="/projects">
                Projects
              </Link>
              ).
            </li>
            <li>
              Choose <strong className="text-slate-900">Excel (.xlsx)</strong> for spreadsheets or <strong className="text-slate-900">PDF</strong> for a
              printable dump.
            </li>
            <li>
              Click <strong className="text-slate-900">Download export</strong>. Your browser will save a file; if nothing
              happens, check pop-up blockers.
            </li>
          </ol>
        </Card>

        {loading ? (
          <p className="text-slate-500">Loading projects…</p>
        ) : projects.length === 0 ? (
          <Alert variant="info" className="text-center">
            <p className="font-medium">No projects found.</p>
            <p className="mt-2 text-sm">
              Create a project on the{' '}
              <Link className="font-semibold underline" href="/projects">
                Projects
              </Link>{' '}
              page first.
            </p>
          </Alert>
        ) : (
          <form
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100 sm:p-8"
            onSubmit={onSubmit}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project" htmlFor="export-project">
                <Select id="export-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Format" htmlFor="export-format">
                <Select id="export-format" name="format" defaultValue="xlsx">
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="pdf">PDF (.pdf)</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" className="mt-6 w-full sm:w-auto sm:px-10">
              Download export
            </Button>
            {error ? (
              <Alert variant="error" className="mt-4">
                {error}
              </Alert>
            ) : null}
          </form>
        )}
    </div>
  );
}
