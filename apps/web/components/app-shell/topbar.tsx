'use client';

import { useRouter } from 'next/navigation';
import { LogOut, Menu, ShieldCheck } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { QuickAccessMenu } from './quick-access-menu';
import { logoutSession, type MeResponse } from '@/lib/api';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Topbar({ user, onOpenMobileNav }: { user: MeResponse; onOpenMobileNav: () => void }) {
  const router = useRouter();

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="rounded-lg bg-transparent p-2 text-slate-600 hover:bg-slate-100 md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <QuickAccessMenu />
        <DropdownMenu
          trigger={({ onClick }) => (
            <button
              type="button"
              onClick={onClick}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-200"
              aria-label="Account menu"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-semibold text-white">
                {initials(user.full_name)}
              </span>
              <span className="hidden sm:inline">{user.full_name}</span>
            </button>
          )}
        >
          <div className="px-3.5 py-2">
            <p className="truncate text-sm font-semibold text-slate-900">{user.full_name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          {user.is_admin ? (
            <div className="mx-3.5 mb-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Admin
            </div>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            icon={<LogOut className="h-4 w-4" aria-hidden />}
            onSelect={() => {
              void logoutSession().then(() => router.push('/'));
            }}
          >
            Log out
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </header>
  );
}
