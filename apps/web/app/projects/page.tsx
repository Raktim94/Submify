'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Nav } from '../../components/nav';
import { api } from '../../lib/api';
import { NODEDR_CONTACT_PROXY_REUSE_PROMPT } from '../../lib/nodedrContactProxyReusePrompt';

type Project = {
  id: string;
  name: string;
  is_default: boolean;
  api_key: string;
  api_secret: string;
  allowed_origins?: string[];
  telegram_chat_id: string;
  telegram_configured: boolean;
  s3_endpoint: string;
  s3_bucket: string;
  s3_configured: boolean;
  created_at: string;
};

type CopyField = 'public' | 'secret' | null;

function MaskedKeyValue({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xs text-slate-800">••••••••••••••••••••••••••••</p>
    </div>
  );
}

function ProjectCard({
  project: p,
  onRegenerate,
  onSaveOrigins,
  onSaveTelegram,
  onClearTelegram,
  onSaveS3,
  onClearS3,
  onDelete
}: {
  project: Project;
  onRegenerate: () => void;
  onSaveOrigins: (raw: string) => Promise<void>;
  onSaveTelegram: (chatID: string, token: string) => Promise<void>;
  onClearTelegram: () => Promise<void>;
  onSaveS3: (endpoint: string, bucket: string, accessKey: string, secretKey: string) => Promise<void>;
  onClearS3: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [originsDraft, setOriginsDraft] = useState(() => JSON.stringify(p.allowed_origins ?? [], null, 2));
  const [telegramChatDraft, setTelegramChatDraft] = useState(() => p.telegram_chat_id ?? '');
  const [telegramTokenDraft, setTelegramTokenDraft] = useState('');
  const [s3EndpointDraft, setS3EndpointDraft] = useState(() => p.s3_endpoint ?? '');
  const [s3BucketDraft, setS3BucketDraft] = useState(() => p.s3_bucket ?? '');
  const [s3AccessDraft, setS3AccessDraft] = useState('');
  const [s3SecretDraft, setS3SecretDraft] = useState('');
  const [copied, setCopied] = useState<CopyField>(null);
  const originsKey = JSON.stringify(p.allowed_origins ?? []);

  async function copyKey(which: Exclude<CopyField, null>) {
    const value = which === 'public' ? p.api_key : p.api_secret;
    await navigator.clipboard.writeText(value);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1200);
  }

  useEffect(() => {
    setOriginsDraft(JSON.stringify(p.allowed_origins ?? [], null, 2));
    setTelegramChatDraft(p.telegram_chat_id ?? '');
    setTelegramTokenDraft('');
    setS3EndpointDraft(p.s3_endpoint ?? '');
    setS3BucketDraft(p.s3_bucket ?? '');
    setS3AccessDraft('');
    setS3SecretDraft('');
  }, [p.id, p.api_key, originsKey, p.telegram_chat_id, p.s3_endpoint, p.s3_bucket]);

  return (
    <li className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="font-display text-xl font-semibold text-slate-900">{p.name}</h3>
            <p className="mt-1 text-xs text-slate-500">Created {new Date(p.created_at).toLocaleString()}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  p.telegram_configured ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Telegram: {p.telegram_configured ? 'Configured' : 'Not set'}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  p.s3_configured ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                }`}
              >
                S3: {p.s3_configured ? 'Configured' : 'Not set'}
              </span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MaskedKeyValue label="Public API key (hidden)" />
            <MaskedKeyValue label="Secret API key (hidden)" />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Secret API key</p>
            <p className="mt-1 text-xs text-amber-800">Only use server-side for HMAC signing.</p>
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
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Telegram notifications (per project)</p>
            <p className="mt-1 text-xs text-slate-500">
              Configure a dedicated bot + chat for this project so notifications never mix with other projects.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                value={telegramChatDraft}
                onChange={(e) => setTelegramChatDraft(e.target.value)}
                placeholder="Chat ID (e.g. -1001234567890)"
                aria-label="Project Telegram chat ID"
              />
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                value={telegramTokenDraft}
                onChange={(e) => setTelegramTokenDraft(e.target.value)}
                placeholder={p.telegram_configured ? 'New bot token (leave blank to keep)' : 'Bot token from @BotFather'}
                aria-label="Project Telegram bot token"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => void onSaveTelegram(telegramChatDraft, telegramTokenDraft)}
              >
                Save Telegram
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-50"
                onClick={() => void onClearTelegram()}
              >
                Clear Telegram
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">S3 storage (per project)</p>
            <p className="mt-1 text-xs text-slate-500">
              Presigned uploads for this project will use these credentials.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 sm:col-span-2"
                value={s3EndpointDraft}
                onChange={(e) => setS3EndpointDraft(e.target.value)}
                placeholder="Endpoint URL (e.g. http://rustfs:9000)"
                aria-label="Project S3 endpoint"
              />
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                value={s3BucketDraft}
                onChange={(e) => setS3BucketDraft(e.target.value)}
                placeholder="Bucket"
                aria-label="Project S3 bucket"
              />
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                value={s3AccessDraft}
                onChange={(e) => setS3AccessDraft(e.target.value)}
                placeholder={p.s3_configured ? 'New access key (blank = keep)' : 'Access key'}
                type="password"
                aria-label="Project S3 access key"
              />
              <input
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 sm:col-span-2"
                value={s3SecretDraft}
                onChange={(e) => setS3SecretDraft(e.target.value)}
                placeholder={p.s3_configured ? 'New secret key (blank = keep)' : 'Secret key'}
                type="password"
                aria-label="Project S3 secret key"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => void onSaveS3(s3EndpointDraft, s3BucketDraft, s3AccessDraft, s3SecretDraft)}
              >
                Save S3
              </button>
              <button
                type="button"
                className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-900 hover:bg-rose-50"
                onClick={() => void onClearS3()}
              >
                Clear S3
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:shrink-0">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 active:scale-[0.99]"
            onClick={() => void copyKey('public')}
          >
            {copied === 'public' ? 'Copied public key' : 'Copy public key'}
          </button>
          <button
            type="button"
            className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm font-medium text-amber-950 transition hover:bg-amber-100 active:scale-[0.99]"
            onClick={() => void copyKey('secret')}
          >
            {copied === 'secret' ? 'Copied secret key' : 'Copy secret key'}
          </button>
          <button
            type="button"
            className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-900 hover:bg-rose-50"
            onClick={onRegenerate}
          >
            Regenerate keys
          </button>
          <button
            type="button"
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-900 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void onDelete()}
            disabled={p.is_default}
            title={p.is_default ? 'Default project cannot be deleted' : 'Delete this project'}
          >
            Delete project
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
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ regenerate_key: true })
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not regenerate keys');
    }
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
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ allowed_origins: parsed })
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save allowed origins');
    }
  }

  async function saveProjectTelegram(id: string, chatID: string, token: string) {
    const payload: { telegram_chat_id: string; telegram_bot_token?: string } = {
      telegram_chat_id: chatID.trim()
    };
    const trimmedToken = token.trim();
    if (trimmedToken) payload.telegram_bot_token = trimmedToken;
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save Telegram settings');
    }
  }

  async function clearProjectTelegram(id: string) {
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ telegram_chat_id: '', telegram_bot_token: '' })
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not clear Telegram');
    }
  }

  async function saveProjectS3(id: string, endpoint: string, bucket: string, accessKey: string, secretKey: string) {
    const payload: { s3_endpoint: string; s3_bucket: string; s3_access_key?: string; s3_secret_key?: string } = {
      s3_endpoint: endpoint.trim(),
      s3_bucket: bucket.trim()
    };
    const trimmedAccess = accessKey.trim();
    const trimmedSecret = secretKey.trim();
    if (trimmedAccess) payload.s3_access_key = trimmedAccess;
    if (trimmedSecret) payload.s3_secret_key = trimmedSecret;
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save S3 settings');
    }
  }

  async function clearProjectS3(id: string) {
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ s3_endpoint: '', s3_bucket: '', s3_access_key: '', s3_secret_key: '' })
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not clear S3');
    }
  }

  async function deleteProject(id: string, name: string, isDefault: boolean) {
    if (isDefault) {
      alert('You cannot delete the default project.');
      return;
    }
    const first = confirm(
      `Delete "${name}"?\n\nThis permanently deletes the project and ALL its submissions and project settings. This cannot be undone.`
    );
    if (!first) return;
    const typed = prompt(`Type DELETE to permanently delete "${name}".`);
    if (typed !== 'DELETE') return;
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not delete project');
    }
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
            <strong className="text-slate-900">AI builder?</strong> Expand <strong>Prompt you can reuse in chat</strong> below and paste
            it into Cursor (or any assistant). Read <strong>For AI builders</strong> on{' '}
            <Link className="font-medium text-brand-700 underline" href="/docs/contact-proxy">
              /docs/contact-proxy
            </Link>{' '}
            first. This page uses <code className="text-xs">POST /api/submit</code> for the <strong>Go API</strong> (your project keys);
            the optional Next.js Nodedr marketing proxy is <code className="text-xs">/api/contact-submit</code> — do not confuse them.
          </p>
          <details className="mt-4 max-w-3xl rounded-2xl border border-indigo-200/80 bg-white px-4 py-3 shadow-sm open:shadow-md">
            <summary className="cursor-pointer font-display text-sm font-semibold text-indigo-900">
              Prompt you can reuse in chat (Nodedr submit API proxy)
            </summary>
            <pre className="mt-4 max-h-[min(60vh,28rem)] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-left text-[10px] leading-relaxed text-slate-100 sm:text-xs">
              <code>{NODEDR_CONTACT_PROXY_REUSE_PROMPT}</code>
            </pre>
          </details>
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
                  onSaveTelegram={(chatID, token) => saveProjectTelegram(p.id, chatID, token)}
                  onClearTelegram={() => clearProjectTelegram(p.id)}
                  onSaveS3={(endpoint, bucket, access, secret) => saveProjectS3(p.id, endpoint, bucket, access, secret)}
                  onClearS3={() => clearProjectS3(p.id)}
                  onDelete={() => deleteProject(p.id, p.name, p.is_default)}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
