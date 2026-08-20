import { CopyButton } from '@/components/ui/copy-button';

// Wraps a plain <pre><code> so any parent's typography styling (e.g.
// .doc-prose pre in globals.css) still applies unchanged — this only adds
// a floating copy button, it never restyles the block itself.
export function CopyableCode({ code, className }: { code: string; className?: string }) {
  return (
    <div className={`group relative ${className ?? ''}`}>
      <pre>
        <code>{code}</code>
      </pre>
      <CopyButton text={code} className="absolute right-3 top-3" />
    </div>
  );
}
