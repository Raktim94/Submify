import type { Metadata } from 'next';
import Link from 'next/link';
import { BlogShell } from '@/components/blog/blog-shell';
import { getBlogPost } from '@/lib/blog';

const post = getBlogPost('self-hosted-forms-vs-formspree')!;

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
          Hosted form backends like Formspree solve a real problem: you have a static site and no server, but you still need
          somewhere for form submissions to go. Drop in an endpoint, point your form&apos;s <code>action</code> at it, and
          you are done in five minutes. That convenience is genuine — the question is what you give up for it, and whether
          it matters for what you are building.
        </p>

        <h2 id="what-you-get-hosted">What a hosted service gives you</h2>
        <ul>
          <li>Zero infrastructure — no server, no database, no Docker.</li>
          <li>Instant setup — an endpoint URL and you are collecting submissions.</li>
          <li>Someone else handles uptime, scaling, and patching.</li>
        </ul>

        <h2 id="what-you-trade">What you trade away</h2>
        <ul>
          <li>
            <strong>Data residency.</strong> Every submission — names, emails, message bodies, attachments — sits in a
            third party&apos;s database under their retention and access policies, not yours.
          </li>
          <li>
            <strong>Usage caps and pricing tiers.</strong> Free tiers cap submissions per month; scaling past them means a
            recurring subscription, priced per project or per submission count.
          </li>
          <li>
            <strong>Limited customization.</strong> Notification channels, export formats, and rate-limit behavior are
            whatever the vendor decided to expose, not what you need.
          </li>
        </ul>

        <h2 id="the-self-hosted-tradeoff">What changes with a self-hosted backend</h2>
        <p>
          <Link href="/blog/introducing-submify">Submify</Link> keeps the same integration model — one API key, one endpoint,
          no SDK — but the entire stack (Go API, Postgres, Nginx, Next.js dashboard) runs in Docker Compose on infrastructure
          you control. Concretely, that means:
        </p>
        <ul>
          <li>
            <strong>Data ownership.</strong> Submissions live in your own Postgres volume. Back it up, encrypt it, delete it
            on your own schedule.
          </li>
          <li>
            <strong>Predictable cost.</strong> You pay for the VPS or server you already run, not a per-submission meter.
            Per-project storage is capped at 5,000 submissions so a runaway spam wave cannot fill a disk unbounded.
          </li>
          <li>
            <strong>Integrations on your terms.</strong> Telegram alerts and S3-compatible file uploads (AWS S3, R2, MinIO,
            Wasabi) are configured per project, not limited to whatever a vendor&apos;s dashboard supports.
          </li>
          <li>
            <strong>One key, every site you own.</strong> A single account <code>api_key</code> spans every project across
            every domain, with per-project public/secret keys for isolation.
          </li>
        </ul>

        <h2 id="when-hosted-still-makes-sense">When a hosted service is still the right call</h2>
        <p>
          If you run one static side project and genuinely never plan to touch a server, a hosted service&apos;s five-minute
          setup is hard to beat. The trade-off tips toward self-hosting once you are running forms across multiple sites,
          collecting anything sensitive, or you are already operating a Docker host and the marginal cost of one more
          container is close to zero.
        </p>

        <p>
          See the <Link href="/docs">documentation</Link> for the quick start, or read about the{' '}
          <Link href="/blog/client-portal-launch">client portal</Link> if you need to hand submission access to a client
          without giving them a dashboard login.
        </p>
      </article>
    </BlogShell>
  );
}
