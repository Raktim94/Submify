'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Nav } from '../../components/nav';
import { api, API_BASE } from '../../lib/api';

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
    const token = localStorage.getItem('submify_access_token');
    const res = await fetch(`${API_BASE}/projects/${projectId}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      const t = await res.text();
      setError(t || `Download failed (${res.status})`);
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
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-cyan-50/30">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Nav />

        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Export</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Download <strong className="font-medium text-slate-800">all submissions</strong> for one project as a spreadsheet
            or PDF. You must stay logged in — the browser sends your session token. For very large inboxes, consider exporting
            before bulk-deleting old rows so you stay under the{' '}
            <strong className="font-medium text-slate-800">5,000</strong> row limit per project.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
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
        </section>

        {loading ? (
          <p className="text-slate-500">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-center text-amber-950">
            <p className="font-medium">No projects found.</p>
            <p className="mt-2 text-sm">
              Create a project on the{' '}
              <Link className="font-semibold text-brand-800 underline" href="/projects">
                Projects
              </Link>{' '}
              page first.
            </p>
          </div>
        ) : (
          <form
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-100 sm:p-8"
            onSubmit={onSubmit}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Project</span>
                <select
                  className="w-full rounded-xl border-slate-300 px-4 py-3 text-slate-900"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Format</span>
                <select className="w-full rounded-xl border-slate-300 px-4 py-3 text-slate-900" name="format" defaultValue="xlsx">
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="pdf">PDF (.pdf)</option>
                </select>
              </label>
            </div>
            <button type="submit" className="mt-6 w-full rounded-xl bg-brand-500 py-3.5 text-base font-semibold text-white shadow-md hover:bg-brand-700 sm:w-auto sm:px-10">
              Download export
            </button>
            {error ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
