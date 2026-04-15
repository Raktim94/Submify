import type { MetadataRoute } from 'next';

const routes = [
  '/',
  '/docs',
  '/docs/contact-proxy',
  '/login',
  '/register'
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://submify.vercel.app';
  const now = new Date();
  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.7
  }));
}
