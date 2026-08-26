import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { SubmifyLogo } from '@/components/submify-logo';

export const metadata: Metadata = {
  title: 'API Reference',
  description:
    'Full Submify API reference: authentication, projects & keys, form submissions, calendar & booking (including embedding booking on your own website), the client portal, backups, and integrations.'
};

const GITHUB_REPO = 'https://github.com/Raktim94/Submify';

function headingTextFrom(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(headingTextFrom).join('');
  if (typeof node === 'object' && 'props' in node) {
    return headingTextFrom((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

/** Mirrors GitHub's heading-anchor algorithm (strip disallowed chars, then turn each
 * remaining space into a hyphen — critically, without collapsing runs) so that in-content
 * links like `[Organization & members](#organization--members)` resolve to the same id
 * this renders, the same way they resolve on GitHub itself. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 \-_]/g, '')
    .replace(/ /g, '-');
}

/** Curated top-level sections for the sidebar — mirrors the `##` headings in content/api.md. */
function extractTocFromMarkdown(markdown: string): { id: string; label: string }[] {
  const headingPattern = /^##\s+(.+)$/gm;
  const toc: { id: string; label: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(markdown)) !== null) {
    const cleaned = match[1].replace(/`/g, '');
    // Long headings carry detail (e.g. "Authenticated (`Authorization: Bearer ...`, or session
    // cookies)") that belongs in the document body, not a compact sidebar nav item.
    const parenIndex = cleaned.indexOf(' (');
    const label = cleaned.length > 30 && parenIndex > 0 ? cleaned.slice(0, parenIndex) : cleaned;
    toc.push({ id: slugify(match[1]), label });
  }
  return toc;
}

function readApiDocsMarkdown(): string {
  return fs.readFileSync(path.join(process.cwd(), 'content/api.md'), 'utf-8');
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 id={slugify(headingTextFrom(children))}>{children}</h1>,
  h2: ({ children }) => <h2 id={slugify(headingTextFrom(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(headingTextFrom(children))}>{children}</h3>,
  // Wide reference tables must scroll in their own box on narrow screens, never the page itself.
  // tabIndex makes the scrollable region keyboard-reachable (WCAG 2.1.1 — scrollable-region-focusable).
  table: ({ children }) => (
    <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Scrollable table">
      <table>{children}</table>
    </div>
  ),
  pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
  a: ({ href, children }) => {
    const isInternalAnchor = href?.startsWith('#');
    if (isInternalAnchor) {
      return <a href={href}>{children}</a>;
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
};

export default function DocsPage() {
  const markdown = readApiDocsMarkdown();
  const toc = extractTocFromMarkdown(markdown);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/40">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-6 text-sm">
        <Link href="/" className="inline-flex items-center" aria-label="Submify home">
          <SubmifyLogo className="h-7 w-auto sm:h-8" />
        </Link>
        <div className="flex items-center gap-5">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-500 hover:text-indigo-700"
          >
            GitHub
          </a>
          <Link href="/" className="font-medium text-slate-500 hover:text-indigo-700">
            Back to app
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 pb-24 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="API reference sections" className="hidden lg:block">
          <div className="sticky top-8 space-y-1 border-l border-slate-200 pl-4 text-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">On this page</p>
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded-md py-1 text-slate-600 hover:text-indigo-700"
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <article className="doc-prose min-w-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {markdown}
          </ReactMarkdown>
        </article>
      </div>
    </main>
  );
}
