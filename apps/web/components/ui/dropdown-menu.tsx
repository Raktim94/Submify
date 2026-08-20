'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type DropdownMenuProps = {
  trigger: (props: { onClick: () => void; open: boolean }) => ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
};

// Generic accessible menu (Escape/outside-click-to-close) shared by the
// sidebar user menu and the topbar quick-access menu — no external
// dependency, matching this project's existing hand-rolled components/ui/*
// pattern rather than adding a headless-UI library for one component shape.
export function DropdownMenu({ trigger, children, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger({ onClick: () => setOpen((v) => !v), open })}
      {open ? (
        <div
          role="menu"
          // Closes on any item click via bubbling — an item's own onClick
          // (calling its onSelect) fires first as the direct target, then
          // this bubbles up, so the menu closing never races the selection
          // itself.
          onClick={() => setOpen(false)}
          className={cn(
            'absolute z-40 mt-2 min-w-[13rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownMenuItem({
  onSelect,
  children,
  icon,
  className
}: {
  onSelect: () => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 bg-transparent px-3.5 py-2 text-left text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-900',
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1.5 border-t border-slate-100" aria-hidden />;
}
