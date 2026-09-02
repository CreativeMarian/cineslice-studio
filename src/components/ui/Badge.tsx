import type { ReactNode } from 'react';
import { cn } from '../../utils';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<Variant, string> = {
  default: 'bg-[var(--panel-2)] text-[var(--ink-2)] border border-[var(--border)]',
  success: 'bg-[rgba(63,203,134,0.12)] text-[var(--color-success)]',
  warning: 'bg-[rgba(232,163,61,0.12)] text-[var(--color-warning)]',
  danger: 'bg-[rgba(255,107,90,0.12)] text-[var(--color-danger)]',
  info: 'bg-[rgba(94,140,255,0.12)] text-[var(--color-info)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
};

export function Badge({ children, variant = 'default', className, dot = false }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap max-w-full',
        variantStyles[variant],
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
