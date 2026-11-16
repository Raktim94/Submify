'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createMasterAPIKey, listMasterAPIKeys, revokeMasterAPIKey, type MasterAPIKey } from '@/lib/api';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CopyButton } from '@/components/ui/copy-button';

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function mcpEndpoint(): string {
  if (typeof window === 'undefined') return '/api/v1/mcp';
  return `${window.location.origin}/api/v1/mcp`;
}

function CodeLine({ code, label }: { code: string; label: string }) {
  return (
    <div className="relative">
      <pre
        aria-label={label}
        className="overflow-x-auto rounded-lg bg-slate-900 p-3 pr-12 text-xs leading-relaxed text-slate-100"
      >
        <code>{code}</code>
      </pre>
      <CopyButton text={code} className="absolute right-2 top-2" />
    </div>
  );
}

export function AgentApiKeysCard() {
  const [keys, setKeys] = useState<MasterAPIKey[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newKey, setNewKey] = useState<{ key: string; name: string } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<MasterAPIKey | null>(null);
  const [revokeStatus, setRevokeStatus] = useState('');

  async function load() {
    try {
      const res = await listMasterAPIKeys();
      setKeys(res.api_keys);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load API keys');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('agent_key_name') ?? '').trim();
    const days = Number(data.get('agent_key_expiry') ?? 0);
    setCreating(true);
    setCreateError('');
    try {
      const res = await createMasterAPIKey({ name, expires_in_days: days || undefined });
      setNewKey({ key: res.key, name: res.api_key.name });
      form.reset();
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the key');
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke() {
    if (!confirmRevoke) return;
    const target = confirmRevoke;
    setConfirmRevoke(null);
    try {
      await revokeMasterAPIKey(target.id);
      setRevokeStatus(`Revoked “${target.name}”. Agents using it lose access immediately.`);
      if (newKey && target.key_prefix && newKey.key.startsWith(target.key_prefix)) setNewKey(null);
      await load();
    } catch (err) {
      setRevokeStatus(err instanceof Error ? err.message : 'Could not revoke the key');
    }
  }

  const endpoint = mcpEndpoint();
  const keyForSnippet = newKey?.key ?? 'smk_your_key';
  const claudeCmd = `claude mcp add --transport http submify ${endpoint} --header "Authorization: Bearer ${keyForSnippet}"`;
  const genericJson = JSON.stringify(
    { mcpServers: { submify: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${keyForSnippet}` } } } },
    null,
    2
  );

  return (
    <Card className="mb-8" id="api-keys">
      <CardHeader>
        <CardTitle>API keys for AI agents</CardTitle>
        <CardDescription>
          A master API key lets Claude Code, Codex, Cursor or a script run this account through the built-in MCP server or
          the REST API: create projects and website keys, wire forms, read submissions, manage calendars and team members.
          A key has exactly your permissions. Creating and revoking keys, adding team members, taking or restoring backups, and changing your password stay dashboard-only.
        </CardDescription>
      </CardHeader>

      {newKey ? (
        <Alert variant="success" className="mb-6 space-y-3">
          <p>
            <strong className="font-semibold">Copy “{newKey.name}” now.</strong> It will not be shown again; only a hash is stored.
          </p>
          <CodeLine code={newKey.key} label="New API key" />
        </Alert>
      ) : null}

      <form className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_12rem_auto] md:items-end" onSubmit={onCreate}>
        <Field label="Key name" htmlFor="agent_key_name" hint="Where it will be used, e.g. “Claude Code on laptop”">
          <Input id="agent_key_name" name="agent_key_name" required maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Expires" htmlFor="agent_key_expiry">
          <Select id="agent_key_expiry" name="agent_key_expiry" defaultValue="90">
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In 1 year</option>
            <option value="0">Never</option>
          </Select>
        </Field>
        <Button type="submit" loading={creating} className="md:mb-[1.85rem]">
          Create key
        </Button>
      </form>
      {createError ? <Alert variant="error" className="mt-4">{createError}</Alert> : null}

      <div className="mt-6">
        {loadError ? <Alert variant="error">{loadError}</Alert> : null}
        {keys === null && !loadError ? <p className="text-sm text-slate-500">Loading keys…</p> : null}
        {keys && keys.length === 0 ? <p className="text-sm text-slate-500">No API keys yet.</p> : null}
        {keys && keys.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{k.name}</p>
                  <p className="text-xs text-slate-500">
                    <code className="font-mono">{k.key_prefix}…</code> · {k.user_email} · created {dateFmt.format(new Date(k.created_at))}
                    {' · '}
                    {k.expires_at ? `expires ${dateFmt.format(new Date(k.expires_at))}` : 'never expires'}
                    {' · '}
                    {k.last_used_at ? `last used ${dateTimeFmt.format(new Date(k.last_used_at))}` : 'never used'}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(k)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {revokeStatus ? <p className="mt-3 text-sm text-slate-600" role="status">{revokeStatus}</p> : null}
      </div>

      <div className="mt-8 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Connect an agent</h3>
        <p className="text-sm text-slate-600">Claude Code:</p>
        <CodeLine code={claudeCmd} label="Claude Code command" />
        <p className="text-sm text-slate-600">Any client that supports remote MCP servers (Cursor, Codex, VS Code):</p>
        <CodeLine code={genericJson} label="MCP client configuration" />
        <p className="text-sm text-slate-600">
          REST: send <code className="font-mono text-xs">Authorization: Bearer smk_…</code> to any <code className="font-mono text-xs">/api/v1</code> endpoint.
        </p>
      </div>

      <ConfirmDialog
        open={Boolean(confirmRevoke)}
        title={`Revoke “${confirmRevoke?.name ?? 'this key'}”?`}
        description="Any agent or script using it stops working immediately. This cannot be undone."
        confirmLabel="Revoke key"
        danger
        onConfirm={onRevoke}
        onCancel={() => setConfirmRevoke(null)}
      />
    </Card>
  );
}
