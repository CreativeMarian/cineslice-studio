import { cn } from '../../utils';

export interface QualityGateBadgeProps {
  /** 质量门状态 */
  status: 'pass' | 'warning' | 'fail';
  /** 自定义文案（默认按状态显示：通过/警告/失败） */
  label?: string;
}

const STATUS_CONFIG: Record<QualityGateBadgeProps['status'], { icon: string; label: string; className: string }> = {
  pass: {
    icon: '✅',
    label: '通过',
    className: 'bg-[rgba(63,203,134,0.12)] text-[var(--color-success)]',
  },
  warning: {
    icon: '⚠️',
    label: '警告',
    className: 'bg-[rgba(232,163,61,0.12)] text-[var(--color-warning)]',
  },
  fail: {
    icon: '❌',
    label: '失败',
    className: 'bg-[rgba(255,107,90,0.12)] text-[var(--color-danger)]',
  },
};

/** 质量门状态徽章：通过=绿✅ / 警告=黄⚠️ / 失败=红❌ */
export function QualityGateBadge({ status, label }: QualityGateBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium whitespace-nowrap',
        cfg.className
      )}
    >
      <span>{cfg.icon}</span>
      {label ?? cfg.label}
    </span>
  );
}
