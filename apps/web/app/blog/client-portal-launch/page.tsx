import type { Metadata } from 'next';
import Link from 'next/link';
import { BlogShell } from '@/components/blog/blog-shell';
import { getBlogPost } from '@/lib/blog';

const post = getBlogPost('client-portal-launch')!;

export const metadata: Metadata = {
  title: post.title,
  description: post.description,
  alternates: { canonical: `/blog/${post.slug}` },
  openGraph: {
    type: 'article',
    title: post.title,
    description: post.description,
    publishedTime: post.date
  }
};

export default function Page() {
  return (
    <BlogShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            author: { '@type': 'Organization', name: 'NODEDR INFOTECH PRIVATE LIMITED' }
          })
        }}
      />
      <p className="text-sm text-slate-500">
        <time dateTime={post.date}>
          {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </time>{' '}
        · {post.readingTime}
      </p>

      <article className="doc-prose mt-4">
        <h1>{post.title}</h1>

        <p>
          If you build sites for clients, Submify already gave you a place to collect their forms. What it did not give you,
          until now, was an easy way to let <em>the client</em> see those submissions — without handing them a full
          dashboard account, an API key, or access to your other projects.
        </p>

        <p>That gap is closed. Every project can now enable a <strong>client portal</strong>.</p>

        <h2 id="what-it-is">What the client portal is</h2>
        <p>
          Each project gets its own public, password-protected page at <code>your-host/project-slug</code>. Whoever holds the
          portal password can:
        </p>
        <ul>
          <li>View that project&apos;s submissions in a read-only list.</li>
          <li>Export them as XLSX or PDF.</li>
        </ul>
        <p>They cannot:</p>
        <ul>
          <li>See any other project on the account.</li>
          <li>Delete submissions.</li>
          <li>Access API keys, settings, or anything requiring a dashboard login.</li>
        </ul>

        <h2 id="how-it-works">How it works under the hood</h2>
        <p>
          A portal login exchanges the project&apos;s password for a project-scoped JWT, set as an HttpOnly cookie with
          <code>Cache-Control: no-store</code> on every response, and its own per-project login rate limit so the password
          field cannot be brute-forced. The slug is validated against a reserved-words list so a project cannot accidentally
          collide with a route like <code>/login</code> or <code>/dashboard</code>.
        </p>
        <p>
          A one-time portal password is generated automatically when you create a project. From the Projects screen in the
          dashboard you can regenerate it, set a specific password, clear it, or disable the portal entirely — the slug and
          enabled state are yours to manage per project.
        </p>

        <h2 id="why-it-matters">Why this matters for agencies and freelancers</h2>
        <p>
          If you run Submify across multiple client sites, this removes a recurring support request: &quot;can you send me an
          export of the contact form submissions?&quot; Instead, send the client their project&apos;s portal link and
          password once, and they can pull their own exports whenever they need them — with no standing account to manage,
          rotate, or eventually revoke.
        </p>

        <p>
          Full setup details are in the <Link href="/docs">documentation</Link>. If you have not tried Submify yet, start
          with <Link href="/blog/introducing-submify">the introduction post</Link>.
        </p>
      </article>
    </BlogShell>
  );
}
