'use client';

import Link from 'next/link';
import { SubmifyLogo } from '@/components/submify-logo';
import { usePathname, useRouter } from 'next/navigation';

const appLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/submissions', label: 'Submissions' },
  { href: '/export', label: 'Export' }
];

function linkIsActive(href: string, pathname: string): boolean {
  if (pathname === href) return true;
  if (href === '/submissions') {
    return pathname === '/submissions' || /\/projects\/[^/]+\/submissions/.test(pathname);
  }
  if (href === '/projects') {
    return pathname.startsWith('/projects') && !pathname.includes('/submissions');
  }
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="mb-8 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-lg shadow-indigo-100/40 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-transparent to-violet-50/30" aria-hidden />
      <div className="relative flex flex-wrap items-center gap-2 p-3">
        <Link
          href="/"
          className="mr-1 inline-flex shrink-0 items-center rounded-lg px-2 py-1 transition hover:bg-brand-50"
          title="Marketing home & documentation"
          aria-label="Submify home"
        >
          <SubmifyLogo className="h-7 w-auto sm:h-8" />
        </Link>
        <Link
          href="/docs"
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            pathname === '/docs' || pathname.startsWith('/docs/')
              ? 'bg-indigo-100 text-indigo-900 shadow-sm'
              : 'border border-slate-200/90 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/80'
          }`}
        >
          Docs
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {appLinks.map((link) => {
            const active = linkIsActive(link.href, pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? 'bg-brand-500 text-white shadow-md shadow-indigo-500/25'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/80'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-200 hover:bg-slate-50"
          >
            Home
          </Link>
          <button
            type="button"
            className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
            onClick={() => {
              localStorage.removeItem('submify_access_token');
              localStorage.removeItem('submify_refresh_token');
              localStorage.removeItem('submify_user_api_key');
              localStorage.removeItem('submify_user_name');
              localStorage.removeItem('submify_user_phone');
              router.push('/');
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
