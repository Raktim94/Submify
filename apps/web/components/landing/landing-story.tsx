import { InstallCommand } from '@/components/landing/install-command';

const GITHUB_REPO = 'https://github.com/Raktim94/Submify';

const steps = [
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
    body: 'Use the dashboard to review, export, or bulk-delete when you near limits.'
  }
];

export function LandingStory() {
  return (
    <div className="space-y-16 pb-8">
      <section>
        <h2 className="font-display text-center text-2xl font-bold text-slate-900 sm:text-3xl">How it works</h2>
        <ol className="mx-auto mt-8 grid max-w-4xl gap-6 sm:grid-cols-2">
          {steps.map((item) => (
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

      <section id="install" className="scroll-mt-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Quick start</p>
        <h3 className="font-display mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
          Up and running in one command
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          Clones the repo and starts the full stack — Postgres, API, web, and nginx — with auto-generated secrets on
          first run.
        </p>
        <InstallCommand className="mx-auto mt-6 max-w-xl text-left" />

        <ol className="mx-auto mt-10 max-w-2xl list-decimal space-y-3 pl-6 text-left text-slate-700">
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
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-slate-800"
          >
            Download on GitHub
          </a>
        </div>
      </section>
    </div>
  );
}
