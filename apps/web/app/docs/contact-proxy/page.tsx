import Link from 'next/link';
import { NODEDR_CONTACT_PROXY_REUSE_PROMPT } from '@/lib/nodedrContactProxyReusePrompt';

export default function ContactProxyDocsPage() {
  return (
    <>
      <div className="relative overflow-hidden rounded-3xl border border-violet-200/70 bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 p-8 text-white shadow-2xl shadow-indigo-900/40 sm:p-10">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl"
          aria-hidden
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Integration guide</p>
        <h1 className="relative font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Next.js contact form → Nodedr submit API
        </h1>
        <p className="relative mt-4 max-w-2xl text-base leading-relaxed text-indigo-100/95">
          Keep <strong className="text-white">API keys on the server</strong>. The browser only calls same-origin{' '}
          <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-sm text-cyan-100">POST /api/contact-submit</code>; Next.js
          validates input and forwards to{' '}
          <code className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-sm text-cyan-100">api.nodedr.com</code>.
        </p>
        <p className="relative mt-4">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20"
          >
            ← Main documentation
          </Link>
        </p>
      </div>

      <section id="ai-builders" className="mt-10 scroll-mt-24">
        <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-orange-50/40 p-6 shadow-md sm:p-8">
          <h2 className="font-display text-xl font-bold text-amber-950 sm:text-2xl">For AI coding assistants</h2>
          <p className="mt-3 text-sm leading-relaxed text-amber-950/90 sm:text-base">
            If you use an <strong>AI builder</strong> (Cursor, GitHub Copilot, ChatGPT, or similar), treat the text in{' '}
            <strong>Reuse prompt</strong> below as a <strong>copy-paste prompt</strong>: paste it into a new chat, fill in bracketed
            placeholders, and ask the tool to implement the pattern. That keeps server keys off the client and matches the Nodedr submit
            API rules.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-950/90 sm:text-base">
            <strong>In this Submify monorepo</strong> the Next.js proxy is already implemented at{' '}
            <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-xs text-slate-900 sm:text-sm">/api/contact-submit</code>{' '}
            because <code className="rounded bg-white/80 px-1 font-mono text-xs sm:text-sm">POST /api/submit</code> is used by the{' '}
            <strong>Go API</strong>. If you let an assistant &quot;simplify&quot; routes or nginx without that distinction, you can{' '}
            <strong>break production</strong>. Prefer editing this repo only when you know the impact; use the prompt mainly for{' '}
            <strong>other</strong> Next.js projects.
          </p>
        </div>
      </section>

      <section id="summary" className="mt-12 scroll-mt-24">
        <h2>Overview</h2>
        <p>
          This pattern is for <strong>marketing or brochure sites</strong> where you want contact submissions delivered through{' '}
          <strong>Nodedr&apos;s hosted submit API</strong> without exposing <code>pk_</code> / <code>sk_</code> keys in client bundles.
          It complements the <strong>FormSubmit</strong> flow from the same rule file — pick <em>one</em> submission path per form.
        </p>
        <ul>
          <li>
            <strong>Browser</strong> → <code>fetch(&apos;/api/contact-submit&apos;)</code> with JSON + honeypot.
          </li>
          <li>
            <strong>Route handler</strong> → Zod validation, build <code>{`{ data, files: [] }`}</code>, optional HMAC over the exact UTF-8
            body.
          </li>
          <li>
            <strong>Upstream</strong> → <code>POST https://api.nodedr.com/api/submit</code> with <code>x-api-key</code> and optional{' '}
            <code>x-signature</code>.
          </li>
        </ul>
      </section>

      <section id="submify-path" className="scroll-mt-24">
        <h2>Path in this monorepo</h2>
        <p>
          Submify&apos;s <strong>Go API</strong> already exposes <code>POST /api/submit</code> behind nginx. A Next.js route at the same
          path would never be reached in production.
        </p>
        <div className="callout">
          <strong>Convention here:</strong> the proxy lives at{' '}
          <code className="rounded bg-white/80 px-1 font-mono text-slate-900">/api/contact-submit</code>. Nginx proxies that path to the
          web container <strong>before</strong> the generic <code>/api/</code> → Go rule. On <code>next dev</code>, the route works
          directly on port 3000.
        </div>
      </section>

      <section id="flow" className="scroll-mt-24">
        <h2>Request flow</h2>
        <ol>
          <li>User submits the contact form on the homepage (or any client component).</li>
          <li>
            Client sends JSON: <code>name</code>, <code>email</code>, <code>message</code>, optional <code>company</code>, and{' '}
            <code>gotcha</code> (must be empty — hidden field).
          </li>
          <li>Route returns <code>{`{ ok: true }`}</code> or <code>{`{ error: "..." }`}</code>; map upstream failures to 502 with a safe message.</li>
        </ol>
      </section>

      <section id="env" className="scroll-mt-24">
        <h2>Environment variables</h2>
        <p>
          Set on the <strong>web</strong> service at runtime (see <code>apps/web/.env.example</code> and{' '}
          <code>docker-compose.yml</code>):
        </p>
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Required</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>NODEDR_SUBMIT_PUBLIC_KEY</code> or <code>NODEDR_PUBLIC_KEY</code>
              </td>
              <td>Yes (for a working form)</td>
              <td>Must start with <code>pk_</code>. Not a <code>NEXT_PUBLIC_*</code> variable.</td>
            </tr>
            <tr>
              <td>
                <code>NODEDR_SUBMIT_SECRET_KEY</code>
              </td>
              <td>No</td>
              <td>If set (<code>sk_...</code>), route adds <code>x-signature</code> (hex HMAC-SHA256 of the exact body string).</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>Never commit</strong> real secret keys. Use placeholders in docs and examples only.
        </p>
      </section>

      <section id="files" className="scroll-mt-24">
        <h2>Files in this repository</h2>
        <ul>
          <li>
            <code>apps/web/app/api/contact-submit/route.ts</code> — POST handler, upstream fetch.
          </li>
          <li>
            <code>apps/web/lib/nodedrSubmitEnv.ts</code> — reads env at runtime.
          </li>
          <li>
            <code>apps/web/lib/contactSubmitSchema.ts</code> — shared Zod schema + <code>ContactSubmitPayload</code> type.
          </li>
          <li>
            <code>apps/web/lib/contactSubmitPath.ts</code> — single constant for the client <code>fetch</code> path.
          </li>
          <li>
            <code>apps/web/components/landing/contact-form.tsx</code> — example wired form.
          </li>
          <li>
            <code>infra/nginx/nginx.conf</code> — <code>location /api/contact-submit</code> → Next.js.
          </li>
          <li>
            <code>apps/web/Dockerfile</code> — copies <code>public/</code> into the standalone image (fixes missing logo assets).
          </li>
        </ul>
      </section>

      <section id="csp" className="scroll-mt-24">
        <h2>Content Security Policy</h2>
        <p>
          The browser only talks to <strong>same origin</strong> for this flow. If you add a strict CSP, include{' '}
          <code>connect-src &apos;self&apos;</code> (or your API host) so <code>fetch(&apos;/api/contact-submit&apos;)</code> is
          allowed. You do <strong>not</strong> need to allow <code>api.nodedr.com</code> in the browser CSP — that call is server-side.
        </p>
      </section>

      <section id="prompt" className="scroll-mt-24">
        <h2>Copy-paste prompt for new projects</h2>
        <p>
          <strong>AI builders:</strong> copy everything inside the box below into your assistant chat as the <strong>prompt</strong>, then
          adjust bracketed paths and paths/fetch URLs as explained in <a href="#ai-builders">For AI builders</a> above.
        </p>
        <p>
          Use this in Cursor (or any assistant) to recreate the pattern on another Next.js App Router repo. Replace bracketed paths and,
          for <strong>this</strong> monorepo, swap <code>/api/submit</code> → <code>/api/contact-submit</code> in the generated client
          code.
        </p>
        <pre className="max-h-[min(70vh,32rem)] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-5 text-[13px] leading-relaxed text-slate-100 shadow-inner">
          <code>{NODEDR_CONTACT_PROXY_REUSE_PROMPT}</code>
        </pre>
        <p className="mt-4 text-sm text-slate-600">
          Canonical rules reference: <code className="rounded bg-slate-100 px-1 font-mono">15-formsubmit-and-contact-forms.mdc</code>{' '}
          (Nodedr submit API section).
        </p>
      </section>
    </>
  );
}
