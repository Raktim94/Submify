import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Blog — Submify',
    template: '%s — Submify Blog'
  },
  description: 'News, guides, and comparisons for self-hosting your own HTML form backend with Submify.',
  alternates: {
    canonical: '/blog'
  }
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
