'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Nav } from '../../components/nav';
import { api, getMe } from '../../lib/api';

type Project = {
  id: string;
  name: string;
  public_api_key: string;
  created_at: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [userKey, setUserKey] = useState('');

  async function load() {
    const data = await api<{ projects: Project[] }>('/projects');
    setProjects(data.projects);
  }

  useEffect(() => {
    load();
    getMe()
      .then((me) => {
        setUserKey(me.api_key);
        localStorage.setItem('submify_user_api_key', me.api_key);
      })
      .catch(() => setUserKey(localStorage.getItem('submify_user_api_key') || ''));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api('/projects', { method: 'POST', body: JSON.stringify({ name }) });
    setName('');
    await load();
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Nav />
      <h1 className="mb-4 text-3xl font-bold">Projects</h1>
      {userKey && (
        <section className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm">
          <p className="font-medium text-indigo-900">Primary API key (embed on all sites)</p>
          <code className="mt-2 block break-all text-xs">{userKey}</code>
          <button type="button" className="mt-2" onClick={() => navigator.clipboard.writeText(userKey)}>
            Copy key
          </button>
        </section>
      )}
      <p className="mb-4 text-sm text-slate-600">
        Extra projects organize submissions in the dashboard. Public forms should use your primary key above; each
        project’s legacy key still works if you need a separate ingest endpoint.
      </p>
      <form className="mb-6 flex gap-2" onSubmit={create}>
        <input className="flex-1" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">Create</button>
      </form>

      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.id} className="rounded-lg bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{p.name}</h2>
                <p className="text-xs text-slate-500">Created: {new Date(p.created_at).toLocaleString()}</p>
                <p className="mt-1 break-all text-sm text-slate-600">Legacy / project key: {p.public_api_key}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => navigator.clipboard.writeText(p.public_api_key)}>
                  Copy project key
                </button>
                <Link className="rounded-md border border-slate-300 px-3 py-2" href={`/projects/${p.id}/submissions`}>
                  Submissions
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
