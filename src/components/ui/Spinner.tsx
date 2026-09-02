import { Loader2 } from 'lucide-react';
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
  return <Loader2 className={cn('animate-spin text-[var(--accent)]', sizeMap[size], className)} />;
}

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingState({ message = '加载中...', size = 'md', className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16', className)}>
      <div className="relative">
        <Spinner size={size} />
        <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-soft)] -z-10 animate-pulse" />
      </div>
      <p className="text-sm text-[var(--ink-2)]">{message}</p>
    </div>
  );
}
