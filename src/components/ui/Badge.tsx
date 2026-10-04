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
  success: 'bg-[rgba(16,185,129,0.12)] text-[var(--success)]',
  warning: 'bg-[rgba(245,158,11,0.12)] text-[var(--warning)]',
  danger: 'bg-[rgba(239,68,68,0.12)] text-[var(--danger)]',
  info: 'bg-[rgba(59,130,246,0.12)] text-[var(--info)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
};

export function Badge({ children, variant = 'default', className, dot = false }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium whitespace-nowrap max-w-full',
        variantStyles[variant],
        className
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
