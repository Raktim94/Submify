'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Nav } from '../../components/nav';
import { api } from '../../lib/api';

type Project = {
  id: string;
  name: string;
  api_key: string;
  api_secret: string;
  allowed_origins?: string[];
  created_at: string;
};

function ProjectCard({
  project: p,
  onRegenerate,
  onSaveOrigins
}: {
  project: Project;
  onRegenerate: () => void;
  onSaveOrigins: (raw: string) => Promise<void>;
}) {
  const [originsDraft, setOriginsDraft] = useState(() => JSON.stringify(p.allowed_origins ?? [], null, 2));
  const originsKey = JSON.stringify(p.allowed_origins ?? []);
  useEffect(() => {
    setOriginsDraft(JSON.stringify(p.allowed_origins ?? [], null, 2));
  }, [p.id, p.api_key, originsKey]);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-900">{p.name}</h3>
            <p className="mt-1 text-xs text-slate-500">Created {new Date(p.created_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Public API key</p>
            <code className="mt-1 block break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">
              {p.api_key}
            </code>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Secret API key</p>
            <p className="mt-1 text-xs text-amber-800">
              For HMAC signing and server-side use only — do not embed in public frontends.
            </p>
            <code className="mt-1 block break-all rounded-lg bg-amber-50 px-3 py-2 font-mono text-xs text-slate-900">
              {p.api_secret}
            </code>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Allowed origins (optional)</p>
            <p className="mt-1 text-xs text-slate-500">
              JSON array of exact origins (e.g. <code className="text-slate-700">https://example.com</code>). Empty{' '}
              <code className="rounded bg-slate-100 px-1">[]</code> means no browser restriction.
            </p>
            <textarea
              className="mt-2 w-full min-h-[5rem] rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800"
              value={originsDraft}
              onChange={(e) => setOriginsDraft(e.target.value)}
              spellCheck={false}
              aria-label="Allowed origins JSON"
            />
            <button
              type="button"
              className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              onClick={() => void onSaveOrigins(originsDraft)}
            >
              Save origins
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:shrink-0">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => navigator.clipboard.writeText(p.api_key)}
          >
            Copy public key
          </button>
          <button
            type="button"
            className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm font-medium text-amber-950 hover:bg-amber-100"
            onClick={() => navigator.clipboard.writeText(p.api_secret)}
          >
            Copy secret key
          </button>
          <button
            type="button"
            className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-900 hover:bg-rose-50"
            onClick={onRegenerate}
          >
            Regenerate keys
          </button>
          <Link
            className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            href={`/projects/${p.id}/submissions`}
          >
            Open submissions
          </Link>
        </div>
      </div>
    </li>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [submitEndpoint, setSubmitEndpoint] = useState('/api/submit');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function load() {
    const data = await api<{ projects: Project[] }>('/projects');
    setProjects(data.projects);
  }

  useEffect(() => {
    setSubmitEndpoint(`${window.location.origin}/api/submit`);
    void load().catch(() => setProjects([]));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError('Enter a project name.');
      return;
    }
    setCreateError('');
    setCreating(true);
    try {
      await api<Project>('/projects', { method: 'POST', body: JSON.stringify({ name: trimmed }) });
      setName('');
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create project');
    } finally {
      setCreating(false);
    }
  }

  async function regenerateProject(id: string) {
    if (!confirm('Regenerate keys? The old public and secret keys stop working immediately.')) return;
    await api(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ regenerate_key: true })
    });
    await load();
  }

  async function saveOrigins(id: string, raw: string) {
    let parsed: string[];
    try {
      const j = JSON.parse(raw) as unknown;
      if (!Array.isArray(j) || !j.every((x) => typeof x === 'string')) {
        throw new Error('must be a JSON array of strings');
      }
      parsed = j;
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }
    await api(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ allowed_origins: parsed })
    });
    await load();
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-violet-50/40">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Nav />

        <header className="mb-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Projects</h1>
          <p className="mt-2 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            A <strong className="font-medium text-slate-800">project</strong> is a separate inbox for form submissions. You
            always have at least one (often named &quot;Default&quot;). Each project can store up to{' '}
            <strong className="font-medium text-slate-800">5,000</strong> rows — use{' '}
            <Link className="font-medium text-brand-700 underline" href="/export">
              Export
            </Link>{' '}
            or bulk delete in Submissions before you hit the cap.
          </p>
          <p className="mt-4 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm leading-relaxed text-slate-700">
            <strong className="text-slate-900">AI builder?</strong> If an assistant is wiring a Next.js marketing contact form, use the
            copy-paste prompt on{' '}
            <Link className="font-medium text-brand-700 underline" href="/docs/contact-proxy">
              Documentation → Next.js contact proxy
            </Link>{' '}
            and read <strong>For AI builders</strong> first — this stack uses <code className="text-xs">POST /api/submit</code> for the{' '}
            <strong>Go API</strong> (your project keys below), not the same path as the optional Next.js Nodedr proxy (
            <code className="text-xs">/api/contact-submit</code>). Mixing those up can break submissions.
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-md sm:p-8">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-indigo-800">Submit endpoint</h2>
          <p className="mt-2 text-sm text-slate-700">
            All forms use the same path on your current host (works on localhost, custom domains, and Cloudflare tunnels):
          </p>
          <code className="mt-3 block break-all rounded-xl border border-indigo-100 bg-white px-4 py-3 font-mono text-xs text-slate-900 sm:text-sm">
            {submitEndpoint}
          </code>
          <button
            type="button"
            className="mt-3 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-900 hover:bg-indigo-50"
            onClick={() => navigator.clipboard.writeText(submitEndpoint)}
          >
            Copy endpoint
          </button>
        </section>

        <section className="mb-8 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-md sm:p-8">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-indigo-800">How to submit forms</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700 sm:text-base">
            <li>
              <strong className="text-slate-900">Create a project</strong> (below). Each project gets a{' '}
              <strong className="text-slate-900">public key</strong> (<code className="rounded bg-white px-1.5 py-0.5 text-xs">pk_live_…</code>)
              and a <strong className="text-slate-900">secret key</strong> (
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">sk_live_…</code>) — that pair is what you use for
              that site or client.
            </li>
            <li>
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">POST</code> JSON to the submit URL above with header{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">x-api-key: &lt;public key&gt;</code>. Optional: send{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">x-signature</code> (HMAC of the body with the secret)
              from a server you trust — never put the secret in public browser code.
            </li>
            <li>
              Every project shares the same path (<code className="rounded bg-white px-1.5 py-0.5 text-xs">/api/submit</code>
              ); the <strong className="text-slate-900">public key</strong> decides which inbox receives the submission.
            </li>
          </ul>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
          <h2 className="font-display text-lg font-bold text-slate-900">Create a project</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Pick a short name (e.g. &quot;Contact site&quot;, &quot;Client A&quot;). You&apos;ll get a new public/secret key
            pair for <code className="rounded bg-slate-100 px-1 text-xs">POST /api/submit</code> and a{' '}
            <strong className="text-slate-800">Submissions</strong> inbox for that project.
          </p>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
            onSubmit={create}
            aria-busy={creating}
          >
            <input
              className="min-w-0 flex-1 rounded-xl border-slate-300 px-4 py-3"
              placeholder="New project name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (createError) setCreateError('');
              }}
              aria-label="Project name"
              disabled={creating}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={creating}
              className="shrink-0 rounded-xl bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create project'}
            </button>
          </form>
          {createError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {createError}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="font-display mb-4 text-lg font-bold text-slate-900">Your projects</h2>
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
              <p className="text-slate-600">No projects yet — create one above, or wait for the default list to load.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onRegenerate={() => regenerateProject(p.id)}
                  onSaveOrigins={(raw) => saveOrigins(p.id, raw)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
