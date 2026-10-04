import { cn } from '../../utils';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };
  return (
    <span
      role="status"
      aria-label="加载中"
      className={cn(
        'inline-block rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin',
        sizeMap[size],
        className
      )}
    />
  );
}

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingState({ message = '加载中...', size = 'md', className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16', className)}>
      <Spinner size={size} />
      <p className="text-sm text-[var(--ink-2)]">{message}</p>
    </div>
  );
}
