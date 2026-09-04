import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-110 active:brightness-95 shadow-[0_2px_8px_rgba(43, 116, 245, 0.25)] hover:shadow-[0_4px_16px_rgba(43, 116, 245, 0.35)] hover:-translate-y-0.5 transition-all duration-200',
  secondary:
    'bg-[var(--panel-2)] text-[var(--ink-1)] hover:bg-[var(--panel-3)] border border-[var(--border)] hover:border-[var(--border-hover)]',
  ghost:
    'text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-2)]',
  danger:
    'bg-[var(--color-danger)] text-white hover:brightness-110 active:brightness-95 shadow-[0_2px_8px_rgba(239,68,68,0.3)]',
  outline:
    'border border-[var(--border)] text-[var(--ink-1)] hover:bg-[var(--panel-2)] hover:border-[var(--border-hover)] bg-transparent',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-[var(--radius-control)]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[var(--radius-control)]',
  lg: 'h-12 px-6 text-base gap-2 rounded-[var(--radius-control)]',
  icon: 'h-9 w-9 p-0 rounded-[var(--radius-control)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200 whitespace-nowrap',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page)]',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
          'active:scale-[0.98]',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
