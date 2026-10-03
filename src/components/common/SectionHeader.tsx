import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  /** 图标（建议传入带 accent 颜色的 lucide 图标） */
  icon: ReactNode;
  title: string;
  description?: string;
  /** 右侧操作按钮区 */
  actions?: ReactNode;
}

/** 页面标题 + 描述 + 操作按钮区（与 StageAssets / StageDirector 页头样式一致） */
export function SectionHeader({ icon, title, description, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)] truncate">{title}</h2>
          {description && <p className="text-sm text-[var(--ink-3)] truncate">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
