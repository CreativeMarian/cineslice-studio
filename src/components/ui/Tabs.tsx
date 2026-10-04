import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '../../utils';

export interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsPrimitive.Root
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange}
      className={cn('w-full', className)}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

export interface TabsListProps {
  children: ReactNode;
  className?: string;
}

Tabs.List = function TabsList({ children, className }: TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex items-center gap-1 border-b border-[var(--border)]',
        className
      )}
    >
      {children}
    </TabsPrimitive.List>
  );
};

export interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

Tabs.Trigger = function TabsTrigger({ value, children, className, disabled }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      disabled={disabled}
      className={cn(
        'relative -mb-px inline-flex items-center justify-center px-3 py-2 text-sm font-medium',
        'border-b-2 border-transparent text-[var(--ink-2)]',
        'transition-colors duration-150 ease-out',
        'hover:text-[var(--ink-1)] hover:border-[var(--border-hover)]',
        'data-[state=active]:text-[var(--ink-1)] data-[state=active]:border-[var(--accent)]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
};

export interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

Tabs.Content = function TabsContent({ value, children, className }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={cn('mt-5 outline-none animate-fade-in', className)}
    >
      {children}
    </TabsPrimitive.Content>
  );
};
