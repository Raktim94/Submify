import type { Metadata } from 'next';
import { DocsChrome } from '../../components/docs-chrome';

export const metadata: Metadata = {
  title: 'Documentation — Submify',
  description:
    'How Submify works: accounts, projects, POST /api/submit, CORS, dashboard, exports, Telegram, S3, and Docker self-hosting.'
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsChrome>{children}</DocsChrome>;
}
