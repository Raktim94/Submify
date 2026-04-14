import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation — Submify',
  description:
    'How Submify works: accounts, projects, POST /api/submit, CORS, dashboard, exports, Telegram, S3, and Docker self-hosting.'
};

export default function DocsRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
