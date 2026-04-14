import Link from 'next/link';

const features = [
  { name: 'Unlimited projects', benefit: 'Manage forms for multiple clients or sites from one dashboard.' },
  { name: 'Data sovereignty', benefit: 'Your data stays on your server — not in someone else’s cloud.' },
  { name: 'Telegram alerts', benefit: 'Get notified the moment a form is submitted (optional).' },
  { name: 'One-click exports', benefit: 'Turn submissions into Excel or PDF reports.' },
  { name: 'Security first', benefit: 'Public keys for browsers; secret keys + optional HMAC for servers.' }
];

export function LandingStory() {
  return (
    <div className="space-y-20 pb-8">
      <section className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Why Submify</p>
        <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          The form paradox
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          You want a simple HTML form — not a heavyweight backend or another monthly SaaS that owns your data. Submify is a
          ready-to-run API and dashboard you host yourself: PostgreSQL for submissions, optional Telegram and S3, and exports when
          you need them.
        </p>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div className="rounded-3xl border border-rose-200/80 bg-rose-50/50 p-8 shadow-sm">
          <h3 className="font-display text-xl font-bold text-rose-950">The problem: the middleman tax</h3>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-slate-700">
            <li>
              <strong className="text-slate-900">Third-party form services</strong> — recurring cost, privacy tradeoffs, and caps
              on submissions.
            </li>
            <li>
              <strong className="text-slate-900">Building from scratch</strong> — auth, validation, storage, and exports for every
              new site.
            </li>
          </ul>
        </div>
        <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/50 p-8 shadow-sm">
          <h3 className="font-display text-xl font-bold text-emerald-950">The solution: self-hosted freedom</h3>
          <p className="mt-4 leading-relaxed text-slate-700">
            Deploy with Docker, create projects with public/secret keys, and point any frontend at{' '}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm">POST /api/submit</code>. You keep the data, the
            keys, and the infrastructure.
          </p>
        </div>
      </section>

      <section>
        <h3 className="font-display text-center text-2xl font-bold text-slate-900">How it works</h3>
        <ol className="mx-auto mt-8 grid max-w-4xl gap-6 sm:grid-cols-2">
          {[
            {
              step: '1',
              title: 'Trigger',
              body: 'Your site (React, Vue, or plain HTML) POSTs JSON to your Submify instance with the project public key.'
            },
            {
              step: '2',
              title: 'Processing',
              body: 'Submify validates the key, applies rate limits, and stores the payload in PostgreSQL.'
            },
            {
              step: '3',
              title: 'Action',
              body: 'Optional Telegram notifications and S3-compatible presigned uploads for larger files.'
            },
            {
              step: '4',
              title: 'Management',
              body: 'Use the dashboard to review, export (spreadsheet-style columns), or bulk-delete when you near limits.'
            }
          ].map((item) => (
            <li
              key={item.step}
              className="flex gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md shadow-slate-200/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                {item.step}
              </span>
              <div>
                <p className="font-display font-semibold text-slate-900">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
          <h3 className="font-display text-lg font-bold text-slate-900">Core features</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-6 py-3 font-semibold text-slate-800">Feature</th>
                <th className="px-6 py-3 font-semibold text-slate-800">Benefit</th>
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.name} className="border-b border-slate-100 last:border-0">
                  <td className="px-6 py-4 font-medium text-slate-900">{f.name}</td>
                  <td className="px-6 py-4 text-slate-600">{f.benefit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/50 p-8 sm:p-10">
        <h3 className="font-display text-2xl font-bold text-slate-900">Architecture</h3>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            { title: 'Go (API)', desc: 'High-performance HTTP API and auth.' },
            { title: 'Next.js (Web)', desc: 'Responsive dashboard and docs.' },
            { title: 'PostgreSQL', desc: 'Structured, durable submission storage.' },
            { title: 'Docker', desc: 'One compose file to run the stack.' }
          ].map((item) => (
            <li key={item.title} className="rounded-2xl border border-white/80 bg-white/70 px-5 py-4 shadow-sm">
              <p className="font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="text-center">
        <h3 className="font-display text-2xl font-bold text-slate-900">Get started in minutes</h3>
        <ol className="mx-auto mt-6 max-w-2xl list-decimal space-y-3 pl-6 text-left text-slate-700">
          <li>
            <strong className="text-slate-900">Deploy</strong> — Run Docker Compose on your VPS or homelab.
          </li>
          <li>
            <strong className="text-slate-900">Create</strong> — Register and add a project; copy your public key.
          </li>
          <li>
            <strong className="text-slate-900">Connect</strong> — POST to <code className="font-mono text-sm">/api/submit</code> with{' '}
            <code className="font-mono text-sm">x-api-key</code>.
          </li>
          <li>
            <strong className="text-slate-900">Relax</strong> — Watch submissions in the dashboard; export when you need them.
          </li>
        </ol>
        <p className="mt-10 font-display text-lg font-medium text-slate-600">
          Ready to take back control?
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://github.com/Raktim94/Submify"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-slate-800"
          >
            Download on GitHub
          </a>
          <Link
            href="/docs"
            className="inline-flex rounded-xl border-2 border-indigo-200 bg-white px-6 py-3 text-sm font-semibold text-indigo-900 hover:bg-indigo-50"
          >
            Read the full docs
          </Link>
        </div>
        <p className="mt-8 text-sm text-slate-500">Submify — Your keys, your storage, your rules.</p>
      </section>
    </div>
  );
}
