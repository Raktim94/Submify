'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Nav } from '../../components/nav';
import { api } from '../../lib/api';

type Project = {
  id: string;
  name: string;
  public_api_key: string;
  created_at: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');

  async function load() {
    const data = await api<{ projects: Project[] }>('/projects');
    setProjects(data.projects);
  }

  useEffect(() => {
    load();
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
                <p className="mt-1 break-all text-sm">API Key: {p.public_api_key}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigator.clipboard.writeText(p.public_api_key)}>Copy API key</button>
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
