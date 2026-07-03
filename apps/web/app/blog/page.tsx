import Link from 'next/link';
import { BlogShell } from '@/components/blog/blog-shell';
import { blogPosts } from '@/lib/blog';

export default function BlogIndexPage() {
  return (
    <BlogShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Blog',
            name: 'Submify Blog',
            url: 'https://submify.vercel.app/blog',
            blogPost: blogPosts.map((post) => ({
              '@type': 'BlogPosting',
              headline: post.title,
              description: post.description,
              datePublished: post.date,
              url: `https://submify.vercel.app/blog/${post.slug}`
            }))
          })
        }}
      />

      <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Blog</p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Submify blog
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Announcements, self-hosting guides, and comparisons for teams running their own form backend.
      </p>

      <div className="mt-10 space-y-6">
        {blogPosts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/40"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {post.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-indigo-50 px-2.5 py-1">
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="font-display mt-3 text-xl font-bold text-slate-900 group-hover:text-indigo-800">
              {post.title}
            </h2>
            <p className="mt-2 text-slate-600">{post.description}</p>
            <p className="mt-3 text-sm text-slate-500">
              <time dateTime={post.date}>
                {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>{' '}
              · {post.readingTime}
            </p>
          </Link>
        ))}
      </div>
    </BlogShell>
  );
}
