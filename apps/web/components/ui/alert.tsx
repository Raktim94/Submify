import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'success' | 'error' | 'info';

const variantClasses: Record<Variant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-amber-200 bg-amber-50 text-amber-950'
};

export function Alert({
  variant = 'info',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: Variant }) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg border p-3 text-sm leading-relaxed',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
