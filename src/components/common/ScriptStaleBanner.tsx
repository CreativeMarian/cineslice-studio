// 剧本过期提示条：剧本已修改后，下游（角色/场景/分镜）可能过期时的黄色警告条
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui';
import { cn } from '../../utils';

export interface ScriptStaleBannerProps {
  /** 提示文案，如"剧本已修改，角色/场景可能已过期，建议重新提取" */
  message: string;
  /** 右侧操作按钮文案，如"重新提取" / "重新生成分镜" */
  actionLabel: string;
  onAction: () => void;
  className?: string;
}

export function ScriptStaleBanner({ message, actionLabel, onAction, className }: ScriptStaleBannerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30',
        className
      )}
    >
      <AlertTriangle className="w-4 h-4 text-[var(--warning)] flex-shrink-0" />
      <span className="text-[13px] text-[var(--warning)] flex-1 min-w-0">{message}</span>
      <Button size="sm" variant="secondary" onClick={onAction} className="flex-shrink-0">
        {actionLabel}
      </Button>
    </div>
  );
}
