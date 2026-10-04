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
    'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-2)]',
  secondary:
    'bg-[var(--panel-2)] text-[var(--ink-1)] border border-[var(--border)] hover:bg-[var(--panel-3)] hover:border-[var(--border-hover)]',
  ghost:
    'text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-2)]',
  danger:
    'bg-[var(--danger)] text-white hover:brightness-110',
  outline:
    'border border-[var(--border)] text-[var(--ink-1)] hover:bg-[var(--panel-2)] hover:border-[var(--border-hover)] bg-transparent',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-[var(--radius-control)]',
  md: 'h-8 px-3.5 text-sm gap-2 rounded-[var(--radius-control)]',
  lg: 'h-9 px-5 text-sm gap-2 rounded-[var(--radius-control)]',
  icon: 'h-8 w-8 p-0 rounded-[var(--radius-control)]',
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
          'inline-flex items-center justify-center font-medium transition-all duration-150 ease-out whitespace-nowrap',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page)]',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
          'active:brightness-90',
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
