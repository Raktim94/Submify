'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Nav } from '../../components/nav';
import { api, API_BASE } from '../../lib/api';

type Project = { id: string; name: string };

export default function ExportPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    api<{ projects: Project[] }>('/projects').then((data) => {
      setProjects(data.projects);
      if (data.projects[0]) setProjectId(data.projects[0].id);
    });
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const format = form.get('format') as string;
    window.open(`${API_BASE}/projects/${projectId}/export?format=${format}`, '_blank');
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Nav />
      <h1 className="mb-4 text-3xl font-bold">Export</h1>
      <form className="flex flex-wrap gap-2" onSubmit={onSubmit}>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="format" defaultValue="xlsx">
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="pdf">PDF (.pdf)</option>
        </select>
        <button type="submit">Download Export</button>
      </form>
    </main>
  );
}
