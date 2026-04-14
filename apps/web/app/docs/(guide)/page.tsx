import Link from 'next/link';
import { NODEDR_CONTACT_PROXY_REUSE_PROMPT } from '@/lib/nodedrContactProxyReusePrompt';

export default function DocsPage() {
  return (
    <>
      <div className="rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-white via-indigo-50/40 to-violet-50/50 p-8 shadow-xl shadow-indigo-100/40 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Guide</p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          How Submify works
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-slate-600">
          Submify is a self-hosted backend for HTML/JS forms. You create <strong className="text-slate-800">projects</strong>, each
          with a <strong className="text-slate-800">public</strong> and <strong className="text-slate-800">secret</strong> key. Browsers
          POST JSON to <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-sm">/api/submit</code> with the public key;
          you review rows in the dashboard and export when needed.
        </p>
        <p className="mt-4 rounded-2xl border border-indigo-100 bg-white/80 px-4 py-3 text-sm text-indigo-950 shadow-sm">
          <strong className="font-semibold">Next.js marketing sites</strong> — For the server-only Nodedr submit proxy pattern (contact
          forms without exposing keys), see the dedicated{' '}
          <Link href="/docs/contact-proxy" className="font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900">
            Next.js contact proxy guide
          </Link>
          . If you use an <strong>AI coding assistant</strong>, that page includes a <strong>copy-paste prompt</strong> for implementing
          the same pattern elsewhere; read <strong>For AI builders</strong> there before changing routes so you do not break{' '}
          <code className="rounded bg-white px-1 font-mono text-xs">/api/submit</code> vs{' '}
          <code className="rounded bg-white px-1 font-mono text-xs">/api/contact-submit</code>.
        </p>

        <details className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm open:shadow-md">
          <summary className="cursor-pointer font-display text-sm font-semibold text-slate-900">
            Prompt you can reuse in chat (copy for AI assistants)
          </summary>
          <pre className="mt-4 max-h-[min(50vh,24rem)] overflow-auto rounded-xl border border-slate-100 bg-slate-950 p-4 text-left text-[11px] leading-relaxed text-slate-100 sm:text-xs">
            <code>{NODEDR_CONTACT_PROXY_REUSE_PROMPT}</code>
          </pre>
          <p className="mt-3 text-xs text-slate-600">
            In <strong>this</strong> monorepo the Next.js proxy is <code className="rounded bg-slate-100 px-1">/api/contact-submit</code>;{' '}
            <code className="rounded bg-slate-100 px-1">POST /api/submit</code> is the Go API (project keys). See{' '}
            <Link href="/docs/contact-proxy" className="font-medium text-indigo-700 underline">
              /docs/contact-proxy
            </Link>{' '}
            for context.
          </p>
        </details>
      </div>

      <section id="overview" className="animate-fade-in-up motion-reduce:animate-none">
        <h2>Overview</h2>
        <p>
          <strong>Web app</strong> (this UI) runs in Next.js and talks to the API under{' '}
          <code>/api/v1</code> (for example <code>/api/v1/projects</code>). <strong>Public</strong> form submissions use a separate
          route: <code>POST /api/submit</code> and do not use your account password — they use the{' '}
          <strong>project public key</strong> (<code>pk_live_…</code>) in the <code>x-api-key</code> header.
        </p>
        <p>
          Typical flow: <strong>register</strong> → open <strong>Projects</strong> → create or select a project → copy the public (and
          secret, for server-side HMAC) keys → point your form or fetch script at your site&apos;s <code>/api/submit</code> → review{' '}
          <strong>Submissions</strong> and <strong>Export</strong> as needed.
        </p>
        <div className="callout">
          <strong>Tip</strong> — From any app page, use <strong>Home</strong> in the top bar to return to the marketing homepage, or{' '}
          <strong>Docs</strong> (this page) for reference. You do not need to log out to browse the site.
        </div>
      </section>

      <section id="architecture" className="animate-fade-in-up motion-reduce:animate-none [animation-delay:60ms]">
        <h2>Architecture</h2>
        <ul>
          <li>
            <strong>API</strong> (Go): authentication, projects, submissions, exports, optional update checks against GitHub.
          </li>
          <li>
            <strong>PostgreSQL</strong>: users, projects, submissions, system config (e.g. latest known app version).
          </li>
          <li>
            <strong>Object storage</strong> (S3-compatible, e.g. MinIO): optional presigned uploads for large files from the dashboard
            flow.
          </li>
          <li>
            <strong>Reverse proxy</strong> (nginx in the default stack): routes <code>/api/*</code> to the API and everything else to
            the web UI. An exception proxies <code>/api/contact-submit</code> to Next.js for the optional marketing contact form (Nodedr
            upstream).
          </li>
        </ul>
      </section>

      <section id="quick-start" className="animate-fade-in-up motion-reduce:animate-none [animation-delay:120ms]">
        <h2>Quick start</h2>
        <ol>
          <li>
            <strong>Create an account</strong> — Register with name, phone, email, and password (8+ characters). You are signed in with
            JWT access + refresh tokens stored in the browser.
          </li>
          <li>
            <strong>Open Projects</strong> — You get a default inbox; you can create more projects. Each has a unique public/secret pair.
          </li>
          <li>
            <strong>Copy the submit URL</strong> — Shown on the Projects page (same path on every host: <code>/api/submit</code>).
          </li>
          <li>
            <strong>Send a test POST</strong> — JSON body with at least a non-empty payload; header{' '}
            <code>x-api-key: &lt;your public key&gt;</code>.
          </li>
          <li>
            <strong>Open Submissions</strong> for that project to see rows.
          </li>
        </ol>
      </section>

      <section id="auth">
        <h2>Sign-in &amp; tokens</h2>
        <p>
          Dashboard and API routes under <code>/api/v1</code> require a <strong>Bearer</strong> access token (
          <code>Authorization: Bearer &lt;access_token&gt;</code>). Tokens are issued at <code>POST /api/v1/auth/register</code> and{' '}
          <code>POST /api/v1/auth/login</code>.
        </p>
        <p>
          When the access token expires, the app refreshes it using <code>POST /api/v1/auth/refresh</code> with your refresh token. If
          refresh fails, sign in again.
        </p>
        <p>
          <strong>Logout</strong> clears local storage and sends you to the <strong>home</strong> page so you can still read
          documentation and marketing content without being trapped in the app.
        </p>
      </section>

      <section id="projects-keys">
        <h2>Projects &amp; API keys</h2>
        <p>Each <strong>project</strong> is an inbox with its own keys:</p>
        <ul>
          <li>
            <strong>Public key</strong> (<code>pk_live_…</code>) — Safe to embed in public frontends; used as <code>x-api-key</code> for{' '}
            <code>POST /api/submit</code>.
          </li>
          <li>
            <strong>Secret key</strong> (<code>sk_live_…</code>) — For HMAC signing on a server you trust; never expose in browser-only
            code.
          </li>
          <li>
            <strong>Allowed origins</strong> (optional) — JSON array of exact origins (e.g. <code>https://example.com</code>). If set,
            browser submissions may be restricted to those origins.
          </li>
        </ul>
        <p>
          You can <strong>regenerate</strong> keys from the Projects page; old keys stop working immediately.
        </p>
      </section>

      <section id="submit-api">
        <h2>
          <code>POST /api/submit</code>
        </h2>
        <p>Public endpoint (no Bearer session). Identifies the destination project via the public key.</p>
        <h3>Headers</h3>
        <ul>
          <li>
            <code>x-api-key</code> — Required. Your project&apos;s public key (<code>pk_live_…</code>).
          </li>
          <li>
            <code>x-signature</code> — Optional. HMAC-SHA256 hex digest of the raw JSON body using the project secret, for server-side
            verification.
          </li>
          <li>
            <code>Origin</code> / <code>Referer</code> — Used with allowed origins when configured.
          </li>
        </ul>
        <h3>Body</h3>
        <p>
          JSON object. Common shape includes <code>data</code> for fields and <code>files</code> for references; the API stores the
          payload and may notify Telegram if configured.
        </p>
        <pre>
          <code>{`{
  "data": { "name": "Ada", "email": "ada@example.com" },
  "files": []
}`}</code>
        </pre>
        <p>
          <strong>Limits</strong> — Body size is capped (configurable on the server). Each project has a submission cap (e.g. 5,000
          rows); export or delete old data before hitting it.
        </p>
      </section>

      <section id="cors-origins">
        <h2>CORS &amp; origins</h2>
        <p>
          The API can allow browser <code>Origin</code> headers based on your deployment settings: explicit allowlists, same-host
          origins behind a reverse proxy, and optional relaxed rules for LAN or public submit. For embedded forms,{' '}
          <code>CORS_PUBLIC_SUBMIT_ANY_ORIGIN</code> may be enabled so any site can POST with a valid public key.
        </p>
        <p>
          Use <strong>Allowed origins</strong> on the project when you want to restrict which frontends may submit for that key.
        </p>
      </section>

      <section id="rate-limits">
        <h2>Rate limits</h2>
        <p>
          Sensitive public routes (login, register, etc.) and submit routes are rate-limited per IP and/or per key. If you hit a limit,
          wait briefly and retry. Self-hosted users can tune limits via environment variables (see below).
        </p>
      </section>

      <section id="dashboard">
        <h2>Dashboard &amp; updates</h2>
        <p>
          The <strong>Dashboard</strong> shows API health, optional <strong>GitHub</strong> version checks (via <code>GITHUB_REPO</code>
          ), and recent activity. The server compares tags/releases to your running <code>APP_VERSION</code>.
        </p>
        <p>
          <strong>In-dashboard updates</strong> (pull + restart) require Docker socket mounting and explicit enablement (
          <code>ALLOW_UPDATE_TRIGGER</code>). Otherwise update on the host with <code>docker compose pull && docker compose up -d</code>.
        </p>
      </section>

      <section id="submissions">
        <h2>Submissions &amp; export</h2>
        <p>
          Per project, open <strong>Submissions</strong> to list rows. Use <strong>Export</strong> to download XLSX or PDF with a Bearer
          token. Bulk delete is available when you need to free space under the per-project cap.
        </p>
      </section>

      <section id="settings">
        <h2>Telegram &amp; S3 (Settings)</h2>
        <p>
          <strong>Telegram</strong> — Optional bot token + chat ID for notifications on new submissions (configure after login).
        </p>
        <p>
          <strong>S3-compatible storage</strong> — Optional endpoint, keys, and bucket for presigned uploads when you need large files;
          small JSON submissions work without it.
        </p>
      </section>

      <section id="self-hosting">
        <h2>Self-hosting (Docker)</h2>
        <p>
          The default stack uses <code>docker compose</code>: API, web, PostgreSQL, S3-compatible storage, nginx on a port (e.g. 2512).
          Persist data via the documented volume paths. Set <code>JWT_SECRET</code> and database credentials in production.
        </p>
        <p>
          Mount the project directory and Docker socket into the API container only if you want the dashboard &quot;Update &amp; restart&quot;
          button to run compose on the host.
        </p>
      </section>

      <section id="env-vars">
        <h2>Environment variables (reference)</h2>
        <p>
          Names and defaults may vary by release; check your <code>docker-compose.yml</code> and the API <code>config</code> package for the
          source of truth. Common values:
        </p>
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>JWT_SECRET</code>
              </td>
              <td>Signing key for access/refresh tokens (change in production).</td>
            </tr>
            <tr>
              <td>
                <code>DATABASE_URL</code>
              </td>
              <td>PostgreSQL connection string.</td>
            </tr>
            <tr>
              <td>
                <code>ALLOWED_ORIGINS</code>, CORS-related
              </td>
              <td>Browser CORS for dashboard/API; tunnel-friendly options available.</td>
            </tr>
            <tr>
              <td>
                <code>GITHUB_REPO</code>, <code>GITHUB_TOKEN</code>
              </td>
              <td>Update checks (<code>owner/name</code>); optional token for rate limits or private repos.</td>
            </tr>
            <tr>
              <td>
                <code>APP_VERSION</code>
              </td>
              <td>Running version string compared to GitHub tags/releases.</td>
            </tr>
            <tr>
              <td>
                <code>ALLOW_UPDATE_TRIGGER</code>
              </td>
              <td>Enable dashboard-triggered Docker updates when socket is mounted.</td>
            </tr>
            <tr>
              <td>
                <code>RATE_LIMIT_*</code>
              </td>
              <td>Tune RPM limits for public and authenticated routes.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="troubleshooting">
        <h2>Troubleshooting</h2>
        <ul>
          <li>
            <strong>401 / invalid token</strong> on dashboard — Session expired or server secret changed; sign in again. Ensure the web
            app is rebuilt so token refresh runs.
          </li>
          <li>
            <strong>Cannot create project / SQL errors</strong> — Ensure API and migrations match; check API logs and DB connectivity.
          </li>
          <li>
            <strong>Submit rejected</strong> — Verify <code>x-api-key</code>, public key format, allowed origins, and payload size.
          </li>
          <li>
            <strong>Update check shows no version</strong> — Repository needs at least one tag or release; set <code>GITHUB_REPO</code>{' '}
            to <code>owner/name</code>.
          </li>
        </ul>
      </section>
    </>
  );
}
