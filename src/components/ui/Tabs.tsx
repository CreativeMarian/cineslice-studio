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
        'inline-flex items-center gap-1 p-1 rounded-[var(--radius-control)] bg-[var(--panel-2)] border border-[var(--border)]',
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
        'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-[8px]',
        'text-[var(--ink-2)] transition-all duration-200',
        'hover:text-[var(--ink-1)]',
        'data-[state=active]:bg-[var(--bg)] data-[state=active]:text-[var(--accent)] data-[state=active]:shadow-[0_1px_3px_rgba(0,0,0,0.3)]',
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
