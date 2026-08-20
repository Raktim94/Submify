'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { NODEDR_CONTACT_PROXY_REUSE_PROMPT } from '@/lib/nodedrContactProxyReusePrompt';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
  zulivio_enabled: boolean;
  zulivio_api_url: string;
  zulivio_configured: boolean;
  email_notifications_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_from_email: string;
  notification_recipients?: string[];
  email_configured: boolean;
  portal_slug: string;
  portal_enabled: boolean;
  portal_password_set: boolean;
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

function PortalPanel({
  project: p,
  revealedPassword,
  onSaveSlug,
  onToggleEnabled,
  onGeneratePassword,
  onSetPassword,
  onDismissPassword
}: {
  project: Project;
  revealedPassword?: string;
  onSaveSlug: (slug: string) => Promise<void>;
  onToggleEnabled: (enabled: boolean) => Promise<void>;
  onGeneratePassword: () => Promise<void>;
  onSetPassword: (pw: string) => Promise<void>;
  onDismissPassword: () => void;
}) {
  const [slugDraft, setSlugDraft] = useState(() => p.portal_slug ?? '');
  const [pwDraft, setPwDraft] = useState('');
  const [copied, setCopied] = useState<'url' | 'password' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSlugDraft(p.portal_slug ?? '');
    setPwDraft('');
  }, [p.id, p.portal_slug]);

  const portalUrl =
    p.portal_slug && typeof window !== 'undefined' ? `${window.location.origin}/${p.portal_slug}` : '';

  async function copy(which: 'url' | 'password', value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1200);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const active = p.portal_enabled && p.portal_password_set;

  return (
    <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/60 to-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-800">Client portal (view &amp; export only)</p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {active ? 'Live' : p.portal_enabled ? 'Needs password' : 'Disabled'}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Share this link and password with your client. They can only view and export this project&apos;s submissions — nothing else.
      </p>

      {portalUrl ? (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Portal URL</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-indigo-100 bg-white px-3 py-2 font-mono text-xs text-slate-900">
              {portalUrl}
            </code>
            <Button size="sm" variant="outline" onClick={() => void copy('url', portalUrl)}>
              {copied === 'url' ? 'Copied' : 'Copy'}
            </Button>
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/50"
            >
              Open
            </a>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Custom URL slug</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Input
            className="min-w-0 flex-1 font-mono text-xs"
            value={slugDraft}
            onChange={(e) => setSlugDraft(e.target.value)}
            placeholder="e.g. acme-contact"
            aria-label="Portal slug"
            spellCheck={false}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || slugDraft.trim() === (p.portal_slug ?? '')}
            onClick={() => void run(() => onSaveSlug(slugDraft.trim()))}
          >
            Save slug
          </Button>
        </div>
      </div>

      {revealedPassword ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 p-3">
          <p className="text-xs font-semibold text-amber-900">New portal password (shown once — copy it now):</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-slate-900">
              {revealedPassword}
            </code>
            <Button size="sm" variant="outline" onClick={() => void copy('password', revealedPassword)}>
              {copied === 'password' ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismissPassword}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Set a custom password (optional)</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Input
            className="min-w-0 flex-1 text-xs"
            type="password"
            value={pwDraft}
            onChange={(e) => setPwDraft(e.target.value)}
            placeholder="At least 8 characters"
            aria-label="Custom portal password"
            autoComplete="new-password"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || pwDraft.trim().length < 8}
            onClick={() => void run(async () => { await onSetPassword(pwDraft.trim()); setPwDraft(''); })}
          >
            Save password
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(onGeneratePassword)}>
          {p.portal_password_set ? 'Generate new password' : 'Generate password'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          className={p.portal_enabled ? 'text-rose-900 hover:bg-rose-50' : 'text-emerald-900 hover:bg-emerald-50'}
          onClick={() => void run(() => onToggleEnabled(!p.portal_enabled))}
        >
          {p.portal_enabled ? 'Disable portal' : 'Enable portal'}
        </Button>
      </div>
    </div>
  );
}

function ProjectCard({
  project: p,
  revealedPassword,
  onRegenerate,
  onSaveOrigins,
  onSaveTelegram,
  onClearTelegram,
  onSaveS3,
  onClearS3,
  onSaveZulivio,
  onClearZulivio,
  onSaveEmail,
  onClearEmail,
  onSavePortalSlug,
  onTogglePortal,
  onGeneratePortalPassword,
  onSetPortalPassword,
  onDismissPortalPassword,
  onDelete
}: {
  project: Project;
  revealedPassword?: string;
  onRegenerate: () => void;
  onSaveOrigins: (raw: string) => Promise<void>;
  onSaveTelegram: (chatID: string, token: string) => Promise<void>;
  onClearTelegram: () => Promise<void>;
  onSaveS3: (endpoint: string, bucket: string, accessKey: string, secretKey: string) => Promise<void>;
  onClearS3: () => Promise<void>;
  onSaveZulivio: (enabled: boolean, apiUrl: string, apiKey: string) => Promise<void>;
  onClearZulivio: () => Promise<void>;
  onSaveEmail: (
    enabled: boolean,
    host: string,
    port: number,
    username: string,
    password: string,
    fromEmail: string,
    recipients: string[]
  ) => Promise<void>;
  onClearEmail: () => Promise<void>;
  onSavePortalSlug: (slug: string) => Promise<void>;
  onTogglePortal: (enabled: boolean) => Promise<void>;
  onGeneratePortalPassword: () => Promise<void>;
  onSetPortalPassword: (pw: string) => Promise<void>;
  onDismissPortalPassword: () => void;
  onDelete: () => void;
}) {
  const [originsDraft, setOriginsDraft] = useState(() => JSON.stringify(p.allowed_origins ?? [], null, 2));
  const [telegramChatDraft, setTelegramChatDraft] = useState(() => p.telegram_chat_id ?? '');
  const [telegramTokenDraft, setTelegramTokenDraft] = useState('');
  const [s3EndpointDraft, setS3EndpointDraft] = useState(() => p.s3_endpoint ?? '');
  const [s3BucketDraft, setS3BucketDraft] = useState(() => p.s3_bucket ?? '');
  const [s3AccessDraft, setS3AccessDraft] = useState('');
  const [s3SecretDraft, setS3SecretDraft] = useState('');
  const [zulivioEnabledDraft, setZulivioEnabledDraft] = useState(() => p.zulivio_enabled);
  const [zulivioUrlDraft, setZulivioUrlDraft] = useState(() => p.zulivio_api_url ?? '');
  const [zulivioKeyDraft, setZulivioKeyDraft] = useState('');
  const [emailEnabledDraft, setEmailEnabledDraft] = useState(() => p.email_notifications_enabled);
  const [smtpHostDraft, setSmtpHostDraft] = useState(() => p.smtp_host ?? '');
  const [smtpPortDraft, setSmtpPortDraft] = useState(() => p.smtp_port || 587);
  const [smtpUsernameDraft, setSmtpUsernameDraft] = useState(() => p.smtp_username ?? '');
  const [smtpPasswordDraft, setSmtpPasswordDraft] = useState('');
  const [smtpFromDraft, setSmtpFromDraft] = useState(() => p.smtp_from_email ?? '');
  const [recipientsDraft, setRecipientsDraft] = useState(() => (p.notification_recipients ?? []).join(', '));
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
    setZulivioEnabledDraft(p.zulivio_enabled);
    setZulivioUrlDraft(p.zulivio_api_url ?? '');
    setZulivioKeyDraft('');
    setEmailEnabledDraft(p.email_notifications_enabled);
    setSmtpHostDraft(p.smtp_host ?? '');
    setSmtpPortDraft(p.smtp_port || 587);
    setSmtpUsernameDraft(p.smtp_username ?? '');
    setSmtpPasswordDraft('');
    setSmtpFromDraft(p.smtp_from_email ?? '');
    setRecipientsDraft((p.notification_recipients ?? []).join(', '));
  }, [
    p.id,
    p.api_key,
    originsKey,
    p.telegram_chat_id,
    p.s3_endpoint,
    p.s3_bucket,
    p.zulivio_enabled,
    p.zulivio_api_url,
    p.email_notifications_enabled,
    p.smtp_host,
    p.smtp_port,
    p.smtp_username,
    p.smtp_from_email
  ]);

  return (
    <li>
      <Card className="rounded-2xl p-5 shadow-sm sm:p-6">
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
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    p.zulivio_enabled && p.zulivio_configured
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Zulivio: {p.zulivio_enabled && p.zulivio_configured ? 'Connected' : 'Not connected'}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    p.email_notifications_enabled && p.email_configured
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Email: {p.email_notifications_enabled && p.email_configured ? 'Configured' : 'Not set'}
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
            <Field
              label={<span className="text-xs font-medium uppercase tracking-wide text-slate-600">Allowed origins (optional)</span>}
              hint={
                <>
                  JSON array of exact origins (e.g. <code className="text-slate-700">https://example.com</code>). Empty{' '}
                  <code className="rounded bg-slate-100 px-1">[]</code> means no browser restriction.
                </>
              }
            >
              <Textarea
                className="mt-2 min-h-[5rem] font-mono text-xs"
                value={originsDraft}
                onChange={(e) => setOriginsDraft(e.target.value)}
                spellCheck={false}
                aria-label="Allowed origins JSON"
              />
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void onSaveOrigins(originsDraft)}>
                Save origins
              </Button>
            </Field>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Telegram notifications (per project)</p>
              <p className="mt-1 text-xs text-slate-500">
                Configure a dedicated bot + chat for this project so notifications never mix with other projects.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input
                  className="text-xs"
                  value={telegramChatDraft}
                  onChange={(e) => setTelegramChatDraft(e.target.value)}
                  placeholder="Chat ID (e.g. -1001234567890)"
                  aria-label="Project Telegram chat ID"
                />
                <Input
                  className="text-xs"
                  value={telegramTokenDraft}
                  onChange={(e) => setTelegramTokenDraft(e.target.value)}
                  placeholder={p.telegram_configured ? 'New bot token (leave blank to keep)' : 'Bot token from @BotFather'}
                  aria-label="Project Telegram bot token"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void onSaveTelegram(telegramChatDraft, telegramTokenDraft)}>
                  Save Telegram
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-900 hover:bg-rose-50" onClick={() => void onClearTelegram()}>
                  Clear Telegram
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600">S3 storage (per project)</p>
              <p className="mt-1 text-xs text-slate-500">Presigned uploads for this project will use these credentials.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input
                  className="text-xs sm:col-span-2"
                  value={s3EndpointDraft}
                  onChange={(e) => setS3EndpointDraft(e.target.value)}
                  placeholder="Endpoint URL (e.g. https://s3.your-provider.com)"
                  aria-label="Project S3 endpoint"
                />
                <Input
                  className="text-xs"
                  value={s3BucketDraft}
                  onChange={(e) => setS3BucketDraft(e.target.value)}
                  placeholder="Bucket"
                  aria-label="Project S3 bucket"
                />
                <Input
                  className="text-xs"
                  value={s3AccessDraft}
                  onChange={(e) => setS3AccessDraft(e.target.value)}
                  placeholder={p.s3_configured ? 'New access key (blank = keep)' : 'Access key'}
                  type="password"
                  aria-label="Project S3 access key"
                />
                <Input
                  className="text-xs sm:col-span-2"
                  value={s3SecretDraft}
                  onChange={(e) => setS3SecretDraft(e.target.value)}
                  placeholder={p.s3_configured ? 'New secret key (blank = keep)' : 'Secret key'}
                  type="password"
                  aria-label="Project S3 secret key"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void onSaveS3(s3EndpointDraft, s3BucketDraft, s3AccessDraft, s3SecretDraft)}>
                  Save S3
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-900 hover:bg-rose-50" onClick={() => void onClearS3()}>
                  Clear S3
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Zulivio CRM (per project)</p>
              <p className="mt-1 text-xs text-slate-500">
                Every submission is pushed to Zulivio as a lead using your Zulivio personal API key. Generate one in
                Zulivio under Settings → API Keys.
              </p>
              <label className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={zulivioEnabledDraft}
                  onChange={(e) => setZulivioEnabledDraft(e.target.checked)}
                />
                Push new submissions to Zulivio
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input
                  className="text-xs sm:col-span-2"
                  value={zulivioUrlDraft}
                  onChange={(e) => setZulivioUrlDraft(e.target.value)}
                  placeholder="Zulivio URL (e.g. https://zulivio.yourcompany.com)"
                  aria-label="Zulivio API URL"
                />
                <Input
                  className="text-xs sm:col-span-2"
                  value={zulivioKeyDraft}
                  onChange={(e) => setZulivioKeyDraft(e.target.value)}
                  placeholder={p.zulivio_configured ? 'New API key (blank = keep)' : 'Zulivio personal API key'}
                  type="password"
                  aria-label="Zulivio API key"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onSaveZulivio(zulivioEnabledDraft, zulivioUrlDraft, zulivioKeyDraft)}
                >
                  Save Zulivio
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-900 hover:bg-rose-50" onClick={() => void onClearZulivio()}>
                  Disconnect Zulivio
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Email notifications (per project)</p>
              <p className="mt-1 text-xs text-slate-500">
                Send each new submission by email through your own SMTP account — pick a sending address, and a list
                of destination addresses to deliver to.
              </p>
              <label className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-700">
                <input type="checkbox" checked={emailEnabledDraft} onChange={(e) => setEmailEnabledDraft(e.target.checked)} />
                Email new submissions
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input
                  className="text-xs"
                  value={smtpHostDraft}
                  onChange={(e) => setSmtpHostDraft(e.target.value)}
                  placeholder="SMTP host (e.g. smtp.gmail.com)"
                  aria-label="SMTP host"
                />
                <Input
                  className="text-xs"
                  type="number"
                  value={smtpPortDraft}
                  onChange={(e) => setSmtpPortDraft(Number(e.target.value))}
                  placeholder="Port (587 or 465)"
                  aria-label="SMTP port"
                />
                <Input
                  className="text-xs"
                  value={smtpUsernameDraft}
                  onChange={(e) => setSmtpUsernameDraft(e.target.value)}
                  placeholder="SMTP username"
                  aria-label="SMTP username"
                />
                <Input
                  className="text-xs"
                  type="password"
                  value={smtpPasswordDraft}
                  onChange={(e) => setSmtpPasswordDraft(e.target.value)}
                  placeholder={p.email_configured ? 'New password (blank = keep)' : 'SMTP password'}
                  aria-label="SMTP password"
                />
                <Input
                  className="text-xs sm:col-span-2"
                  type="email"
                  value={smtpFromDraft}
                  onChange={(e) => setSmtpFromDraft(e.target.value)}
                  placeholder="Sending address (e.g. forms@yourcompany.com)"
                  aria-label="From email address"
                />
                <Input
                  className="text-xs sm:col-span-2"
                  value={recipientsDraft}
                  onChange={(e) => setRecipientsDraft(e.target.value)}
                  placeholder="Deliver to (comma-separated: sales@company.com, jane@company.com)"
                  aria-label="Notification recipient email addresses"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void onSaveEmail(
                      emailEnabledDraft,
                      smtpHostDraft,
                      smtpPortDraft,
                      smtpUsernameDraft,
                      smtpPasswordDraft,
                      smtpFromDraft,
                      recipientsDraft
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                >
                  Save email settings
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-900 hover:bg-rose-50" onClick={() => void onClearEmail()}>
                  Disconnect email
                </Button>
              </div>
            </div>
            <PortalPanel
              project={p}
              revealedPassword={revealedPassword}
              onSaveSlug={onSavePortalSlug}
              onToggleEnabled={onTogglePortal}
              onGeneratePassword={onGeneratePortalPassword}
              onSetPassword={onSetPortalPassword}
              onDismissPassword={onDismissPortalPassword}
            />
          </div>
          <div className="flex flex-col gap-2 sm:shrink-0">
            <Button variant="outline" size="sm" onClick={() => void copyKey('public')}>
              {copied === 'public' ? 'Copied public key' : 'Copy public key'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-200 bg-amber-50/80 text-amber-950 hover:bg-amber-100"
              onClick={() => void copyKey('secret')}
            >
              {copied === 'secret' ? 'Copied secret key' : 'Copy secret key'}
            </Button>
            <Button variant="outline" size="sm" className="border-rose-200 text-rose-900 hover:bg-rose-50" onClick={onRegenerate}>
              Regenerate keys
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onDelete}
              disabled={p.is_default}
              title={p.is_default ? 'Default project cannot be deleted' : 'Delete this project'}
            >
              Delete project
            </Button>
            <Link
              className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              href={`/projects/${p.id}/submissions`}
            >
              Open submissions
            </Link>
          </div>
        </div>
      </Card>
    </li>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [submitEndpoint, setSubmitEndpoint] = useState('/api/submit');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [regenerateTarget, setRegenerateTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  // One-time plaintext portal passwords, keyed by project id (only its hash is stored server-side).
  const [portalPasswords, setPortalPasswords] = useState<Record<string, string>>({});

  async function load() {
    const data = await api<{ projects: Project[] }>('/projects');
    setProjects(data.projects);
  }

  async function savePortalSlug(id: string, slug: string) {
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ portal_slug: slug }) });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save portal slug');
    }
  }

  async function togglePortal(id: string, enabled: boolean) {
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ portal_enabled: enabled }) });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not update portal');
    }
  }

  async function generatePortalPassword(id: string) {
    try {
      const res = await api<{ portal_password?: string }>(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ regenerate_portal_password: true })
      });
      if (res.portal_password) setPortalPasswords((prev) => ({ ...prev, [id]: res.portal_password as string }));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not generate password');
    }
  }

  async function setPortalPassword(id: string, pw: string) {
    try {
      const res = await api<{ portal_password?: string }>(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ portal_password: pw })
      });
      // Confirm the value we set so the owner can copy/share it from the same place.
      setPortalPasswords((prev) => ({ ...prev, [id]: res.portal_password ?? pw }));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not set password');
    }
  }

  function dismissPortalPassword(id: string) {
    setPortalPasswords((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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
      const created = await api<Project & { portal_password?: string }>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed })
      });
      setName('');
      if (created.portal_password) {
        setPortalPasswords((prev) => ({ ...prev, [created.id]: created.portal_password as string }));
      }
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create project');
    } finally {
      setCreating(false);
    }
  }

  async function regenerateProject(id: string) {
    setRegenerateTarget(null);
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

  async function saveProjectZulivio(id: string, enabled: boolean, apiUrl: string, apiKey: string) {
    const payload: { zulivio_enabled: boolean; zulivio_api_url: string; zulivio_api_key?: string } = {
      zulivio_enabled: enabled,
      zulivio_api_url: apiUrl.trim()
    };
    const trimmedKey = apiKey.trim();
    if (trimmedKey) payload.zulivio_api_key = trimmedKey;
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save Zulivio settings');
    }
  }

  async function clearProjectZulivio(id: string) {
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ zulivio_enabled: false, zulivio_api_url: '', zulivio_api_key: '' })
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not disconnect Zulivio');
    }
  }

  async function saveProjectEmail(
    id: string,
    enabled: boolean,
    host: string,
    port: number,
    username: string,
    password: string,
    fromEmail: string,
    recipients: string[]
  ) {
    const payload: {
      email_notifications_enabled: boolean;
      smtp_host: string;
      smtp_port: number;
      smtp_username: string;
      smtp_password?: string;
      smtp_from_email: string;
      notification_recipients: string[];
    } = {
      email_notifications_enabled: enabled,
      smtp_host: host.trim(),
      smtp_port: port,
      smtp_username: username.trim(),
      smtp_from_email: fromEmail.trim(),
      notification_recipients: recipients
    };
    const trimmedPassword = password.trim();
    if (trimmedPassword) payload.smtp_password = trimmedPassword;
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save email settings');
    }
  }

  async function clearProjectEmail(id: string) {
    try {
      await api(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email_notifications_enabled: false,
          smtp_host: '',
          smtp_username: '',
          smtp_password: '',
          smtp_from_email: '',
          notification_recipients: []
        })
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not disconnect email');
    }
  }

  async function deleteProject(id: string) {
    setDeleteTarget(null);
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not delete project');
    }
  }

  return (
    <>
      <div className="mx-auto max-w-5xl">
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
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(submitEndpoint)}>
            Copy endpoint
          </Button>
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

        <Card className="mb-8">
          <h2 className="font-display text-lg font-bold text-slate-900">Create a project</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Pick a short name (e.g. &quot;Contact site&quot;, &quot;Client A&quot;). You&apos;ll get a new public/secret key
            pair for <code className="rounded bg-slate-100 px-1 text-xs">POST /api/submit</code> and a{' '}
            <strong className="text-slate-800">Submissions</strong> inbox for that project.
          </p>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={create} aria-busy={creating}>
            <Input
              className="min-w-0 flex-1"
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
            <Button type="submit" loading={creating} className="shrink-0">
              {creating ? 'Creating…' : 'Create project'}
            </Button>
          </form>
          {createError ? (
            <Alert variant="error" className="mt-3">
              {createError}
            </Alert>
          ) : null}
        </Card>

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
                  revealedPassword={portalPasswords[p.id]}
                  onRegenerate={() => setRegenerateTarget(p.id)}
                  onSaveOrigins={(raw) => saveOrigins(p.id, raw)}
                  onSaveTelegram={(chatID, token) => saveProjectTelegram(p.id, chatID, token)}
                  onClearTelegram={() => clearProjectTelegram(p.id)}
                  onSaveS3={(endpoint, bucket, access, secret) => saveProjectS3(p.id, endpoint, bucket, access, secret)}
                  onClearS3={() => clearProjectS3(p.id)}
                  onSaveZulivio={(enabled, apiUrl, apiKey) => saveProjectZulivio(p.id, enabled, apiUrl, apiKey)}
                  onClearZulivio={() => clearProjectZulivio(p.id)}
                  onSaveEmail={(enabled, host, port, username, password, fromEmail, recipients) =>
                    saveProjectEmail(p.id, enabled, host, port, username, password, fromEmail, recipients)
                  }
                  onClearEmail={() => clearProjectEmail(p.id)}
                  onSavePortalSlug={(slug) => savePortalSlug(p.id, slug)}
                  onTogglePortal={(enabled) => togglePortal(p.id, enabled)}
                  onGeneratePortalPassword={() => generatePortalPassword(p.id)}
                  onSetPortalPassword={(pw) => setPortalPassword(p.id, pw)}
                  onDismissPortalPassword={() => dismissPortalPassword(p.id)}
                  onDelete={() => {
                    if (p.is_default) {
                      alert('You cannot delete the default project.');
                      return;
                    }
                    setDeleteTarget({ id: p.id, name: p.name });
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={regenerateTarget !== null}
        title="Regenerate keys?"
        description="The old public and secret keys stop working immediately."
        confirmLabel="Regenerate"
        danger
        onConfirm={() => regenerateTarget && regenerateProject(regenerateTarget)}
        onCancel={() => setRegenerateTarget(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : ''}
        description="This permanently deletes the project and ALL its submissions and project settings. This cannot be undone."
        confirmText="DELETE"
        confirmLabel="Delete project"
        danger
        onConfirm={() => deleteTarget && deleteProject(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
