import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils';

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  children,
  placeholder,
  className,
  disabled,
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn(
          'flex items-center justify-between w-full h-10 px-3 rounded-[var(--radius-control)] border overflow-hidden',
          'bg-[var(--panel-2)] border-[var(--border)]',
          'text-[var(--ink-1)] text-sm',
          'focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]',
          'transition-all duration-200',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          'hover:border-[var(--border-hover)]',
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="text-[var(--ink-1)] truncate flex-1 text-left min-w-0" />
        <SelectPrimitive.Icon>
          <ChevronDown className="w-4 h-4 text-[var(--ink-3)]" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-[100] min-w-[var(--radix-select-trigger-width)] max-w-[400px] max-h-64 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg)] shadow-[var(--shadow-float)]"
          position="popper"
          sideOffset={6}
        >
          <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export interface SelectItemProps {
  value: string;
  children: ReactNode;
  className?: string;
}

Select.Item = function SelectItem({ value, children, className }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        'relative flex items-center w-full px-8 py-2 text-sm rounded-[8px]',
        'text-[var(--ink-1)] cursor-pointer',
        'hover:bg-[var(--panel-2)] focus:bg-[var(--panel-2)]',
        'data-[highlighted]:outline-none transition-colors',
        className
      )}
    >
      <SelectPrimitive.ItemText className="block w-full truncate">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute left-2.5">
        <Check className="w-4 h-4 text-[var(--accent)]" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
};
