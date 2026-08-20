'use client';

import { useState } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';

const RAW_BASE = 'https://raw.githubusercontent.com/Raktim94/Submify/main';

const OS_TABS = [
  {
    id: 'mac',
    label: 'macOS',
    command: `curl -fsSL ${RAW_BASE}/install.sh | bash`,
    note: 'Requires Docker Desktop and git already installed.'
  },
  {
    id: 'linux',
    label: 'Linux',
    command: `curl -fsSL ${RAW_BASE}/install.sh | bash`,
    note: 'Requires Docker Engine + Compose v2 and git already installed.'
  },
  {
    id: 'windows',
    label: 'Windows',
    command: `irm ${RAW_BASE}/install.ps1 | iex`,
    note: 'Run in PowerShell. Requires Docker Desktop and git already installed.'
  }
] as const;

// One-line clone + docker-compose-up installer, tabbed by OS — mirrors the
// pattern already used on this machine's other NodeDR product sites
// (nodedr-pos). Each command clones (or updates) the repo and runs the
// existing install.sh/install.ps1 at the repo root.
export function InstallCommand({ className }: { className?: string }) {
  const [activeId, setActiveId] = useState<(typeof OS_TABS)[number]['id']>('mac');
  const active = OS_TABS.find((os) => os.id === activeId)!;

  return (
    <div className={className}>
      <div role="tablist" aria-label="Operating system" className="mb-2 inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {OS_TABS.map((os) => (
          <button
            key={os.id}
            type="button"
            role="tab"
            aria-selected={os.id === activeId}
            onClick={() => setActiveId(os.id)}
            className={cn(
              'rounded-md bg-transparent px-3 py-1 text-xs font-semibold transition',
              os.id === activeId ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-900'
            )}
          >
            {os.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3.5 font-mono text-sm text-slate-100 shadow-inner">
        <span className="shrink-0 select-none text-indigo-400">$</span>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <span className="select-all whitespace-pre">{active.command}</span>
        </div>
        <CopyButton text={active.command} className="shrink-0" />
      </div>
      <p className="mt-2 text-xs text-slate-500">{active.note}</p>
    </div>
  );
}
