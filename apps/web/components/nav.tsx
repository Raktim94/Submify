'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/export', label: 'Export' },
  { href: '/settings', label: 'Settings' }
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="mb-8 rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard"
          className="font-display mr-1 shrink-0 rounded-lg px-2 py-1.5 text-lg font-bold tracking-tight text-brand-700 hover:bg-brand-50"
        >
          Submify
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {links.map((link) => {
            const active = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
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
        <button
          type="button"
          className="ml-auto rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          onClick={() => {
            localStorage.removeItem('submify_access_token');
            localStorage.removeItem('submify_refresh_token');
            localStorage.removeItem('submify_user_api_key');
            localStorage.removeItem('submify_user_name');
            localStorage.removeItem('submify_user_phone');
            router.push('/login');
          }}
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
