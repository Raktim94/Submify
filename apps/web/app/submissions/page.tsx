'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Nav } from '../../components/nav';
import { api } from '../../lib/api';

type Project = {
  id: string;
  name: string;
  created_at: string;
};

export default function SubmissionsHubPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ projects: Project[] }>('/projects')
      .then((data) => setProjects(data.projects))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load projects'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-violet-50/40">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Nav />

        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Submissions</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            Each project has its own inbox. Choose a project to view stored rows, IP, user agent, and JSON payload. You can also open
            an inbox from{' '}
            <Link href="/projects" className="font-medium text-brand-700 underline">
              Projects
            </Link>
            .
          </p>
        </header>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-6 py-12">
            <div className="h-10 w-10 animate-pulse rounded-full bg-indigo-200/80" aria-hidden />
            <p className="text-slate-600">Loading projects…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-red-800" role="alert">
            {error}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-6 py-10 text-center">
            <p className="text-slate-800">No projects yet.</p>
            <Link
              href="/projects"
              className="mt-4 inline-flex rounded-xl bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              Create a project
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {projects.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-indigo-100/30 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">{p.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">Created {new Date(p.created_at).toLocaleString()}</p>
                </div>
                <Link
                  href={`/projects/${p.id}/submissions`}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-brand-500 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-indigo-500/40"
                >
                  View inbox
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
