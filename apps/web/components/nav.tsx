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
    <nav className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-md px-3 py-2 ${pathname.startsWith(link.href) ? 'bg-brand-500 text-white' : 'bg-white text-slate-700 border border-slate-300'}`}
        >
          {link.label}
        </Link>
      ))}
      <button
        className="ml-auto bg-slate-800"
        onClick={() => {
          localStorage.removeItem('submify_access_token');
          localStorage.removeItem('submify_refresh_token');
          router.push('/login');
        }}
      >
        Logout
      </button>
    </nav>
  );
}
