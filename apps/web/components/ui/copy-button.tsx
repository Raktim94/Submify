'use client';

import { Check, Copy } from 'lucide-react';
import { useCopyToClipboard } from '@/lib/useCopyToClipboard';
import { cn } from '@/lib/utils';

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => void copy(text)}
      aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-slate-200 transition hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400',
        className
      )}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  );
}
