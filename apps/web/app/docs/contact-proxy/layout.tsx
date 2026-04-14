import type { Metadata } from 'next';
import { DocsChrome, type DocsSidebarItem } from '@/components/docs-chrome';

export const metadata: Metadata = {
  title: 'Next.js Nodedr contact proxy — Submify',
  description:
    'Server-side contact form pattern: POST to Next.js, validate with Zod, forward to api.nodedr.com with x-api-key and optional HMAC. Copy-paste prompt for new projects.'
};

const sidebar: DocsSidebarItem[] = [
  { id: 'ai-builders', label: 'For AI builders' },
  { id: 'summary', label: 'Overview' },
  { id: 'submify-path', label: 'Path in this monorepo' },
  { id: 'flow', label: 'Request flow' },
  { id: 'env', label: 'Environment' },
  { id: 'files', label: 'Files in this repo' },
  { id: 'csp', label: 'CSP' },
  { id: 'prompt', label: 'Reuse prompt' }
];

export default function ContactProxyDocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsChrome sidebarSections={sidebar}>{children}</DocsChrome>;
}
