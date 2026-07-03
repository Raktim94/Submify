import type { Metadata } from 'next';
import Link from 'next/link';
import { BlogShell } from '@/components/blog/blog-shell';
import { getBlogPost } from '@/lib/blog';

const post = getBlogPost('introducing-submify')!;

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
          Every hosted form-backend service — Formspree, Getform, Basin, and the rest — asks you to trust a third party with
          every submission your website collects. That is a reasonable trade for a lot of small projects. It stops being
          reasonable the moment you are handling anything you would not want sitting in someone else&apos;s database
          indefinitely: client contact details, application data, support requests with attachments.
        </p>

        <p>
          <strong>Submify</strong> is our answer to that trade-off: a self-hosted form backend you run yourself. One Docker
          Compose stack gives you a Go API, a Next.js dashboard, PostgreSQL for storage, and Nginx in front of both. Point any
          HTML form or <code>fetch()</code> call at your own <code>/api/submit</code> endpoint, and the submission never
          touches a service you do not control.
        </p>

        <h2 id="how-it-works">How it works</h2>
        <p>
          Register once and you get an account-level <code>api_key</code> plus a default project with its own{' '}
          <code>pk_live_…</code> public key. Embed that key in a form on any site you own — no SDK, no build step. The API
          validates the key, rate-limits abuse, and writes the JSON payload into Postgres under that project, isolated from
          every other account and project sharing the database. The dashboard reads it back over a Bearer-token session,
          lists submissions per project, and exports them as XLSX or PDF.
        </p>

        <h2 id="optional-integrations">Optional integrations, not requirements</h2>
        <p>
          If you want a heads-up the moment a form is submitted, wire up Telegram — bot token and chat ID, done. If you need
          file uploads, point Submify at any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, Wasabi) and the browser
          uploads directly to your bucket via a short-lived presigned URL; Submify only ever stores the resulting object key,
          never the file bytes. Both are optional — plain JSON submissions work with zero extra configuration.
        </p>

        <h2 id="why-self-host">Why self-host a form backend</h2>
        <ul>
          <li>
            <strong>You own the data.</strong> Submissions live in your own Postgres container, not a vendor&apos;s multi-tenant
            database.
          </li>
          <li>
            <strong>One key, every site.</strong> A single account <code>api_key</code> covers every project across every domain
            you run.
          </li>
          <li>
            <strong>No surprise limits.</strong> You are not metered per submission by a third party&apos;s pricing tier.
          </li>
          <li>
            <strong>One command to run.</strong> A single <code>docker compose up</code> brings up the whole stack, with strong
            secrets generated for you on first boot.
          </li>
        </ul>

        <p>
          Submify is MIT-licensed, free to self-host, modify, and use commercially. See the{' '}
          <Link href="/docs">documentation</Link> for a full quick start, or head to{' '}
          <a href="https://github.com/Raktim94/Submify" target="_blank" rel="noreferrer">
            the GitHub repository
          </a>{' '}
          to deploy it.
        </p>
      </article>
    </BlogShell>
  );
}
