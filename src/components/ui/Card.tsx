import type { ReactNode } from 'react';
import { cn } from '../../utils';

export interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  glow?: boolean;
}

export function Card({ children, className, hover = false, onClick, glow = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[var(--card-bg)] rounded-[var(--radius-card)] border border-[var(--border)]',
        'shadow-[var(--shadow-card)]',
        hover && 'cursor-pointer transition-all duration-300 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 card-hover',
        glow && 'shadow-[var(--shadow-glow)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

Card.Header = function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn('px-5 py-4 border-b border-[var(--border)]', className)}>
      {children}
    </div>
  );
};

export interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

Card.Body = function CardBody({ children, className }: CardBodyProps) {
  return <div className={cn('p-5', className)}>{children}</div>;
};

export interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

Card.Footer = function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('px-5 py-4 border-t border-[var(--border)]', className)}>
      {children}
    </div>
  );
};
