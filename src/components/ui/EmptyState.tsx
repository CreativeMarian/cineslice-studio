import type { ReactNode } from 'react';
import { cn } from '../../utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-4',
        className
      )}
    >
      {icon && (
        <div className="w-16 h-16 rounded-[var(--radius-card)] bg-[var(--panel-2)] border border-[var(--border)] flex items-center justify-center mb-5 text-[var(--ink-3)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--ink-1)] mb-2 font-[var(--font-display)]">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--ink-2)] max-w-sm mb-6 leading-relaxed">{description}</p>
      )}
      {action && <div className="flex gap-3">{action}</div>}
    </div>
  );
}
