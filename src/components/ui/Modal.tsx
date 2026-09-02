import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeStyles = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70 animate-fade-in" />
        <DialogPrimitive.Content
          style={{ pointerEvents: 'auto' }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full mx-4 rounded-[var(--radius-shell)] border border-[var(--border)]',
            'bg-[var(--bg)] shadow-[var(--shadow-float)] animate-slide-up',
            'overflow-hidden',
            sizeStyles[size]
          )}
        >
          {(title || description) && (
            <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--panel-2)]/50">
              {title && (
                <DialogPrimitive.Title className="text-lg font-semibold text-[var(--ink-1)] font-[var(--font-display)]">
                  {title}
                </DialogPrimitive.Title>
              )}
              {description && (
                <DialogPrimitive.Description className="mt-1 text-sm text-[var(--ink-2)]">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
          )}
          <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">{children}</div>
          {footer && (
            <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--panel-2)]/30 flex justify-end gap-3">
              {footer}
            </div>
          )}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-2)] transition-colors">
            <X className="w-5 h-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
