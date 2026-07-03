export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTime: string;
  tags: string[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: 'introducing-submify',
    title: 'Introducing Submify: a self-hosted form backend you actually own',
    description:
      'Why we built Submify — a Formspree-style form backend you run yourself, with one API key, your own Postgres, and no third-party service in the request path.',
    date: '2026-07-01',
    readingTime: '4 min read',
    tags: ['Announcement', 'Self-hosting']
  },
  {
    slug: 'self-hosted-forms-vs-formspree',
    title: 'Self-hosted forms vs. Formspree: what changes when you own the stack',
    description:
      'A practical comparison of hosted form backends and self-hosted alternatives like Submify — cost, data ownership, limits, and when each makes sense.',
    date: '2026-07-01',
    readingTime: '5 min read',
    tags: ['Comparison', 'Self-hosting']
  },
  {
    slug: 'client-portal-launch',
    title: 'New: give clients their own portal without a dashboard login',
    description:
      'Submify now supports a per-project client portal — a password-protected page where a client can view and export their own submissions, with no API keys or dashboard account required.',
    date: '2026-07-01',
    readingTime: '3 min read',
    tags: ['Product update', 'Client portal']
  }
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}
