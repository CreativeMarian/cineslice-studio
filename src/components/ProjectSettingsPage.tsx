// 项目设置页：显示创建时锁定的视觉风格 / 画面比例 / 输入模式
// 风格和比例在项目创建时锁定，保证全片视觉统一。如需更改请新建项目。
import { Clapperboard, Lock, Ratio, Type, Info } from 'lucide-react';
import { Card, Badge } from './ui';
import { useProjectStore } from '../stores/useProjectStore';

const INPUT_MODE_LABELS: Record<string, string> = {
  one_liner: '一句话创意',
  outline: '故事大纲',
  novel: '小说文本',
};

export function ProjectSettingsPage() {
  const { currentProject } = useProjectStore();

  return (
    <div className="p-6 max-w-[800px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_12px_var(--accent-glow)]">
          <Clapperboard className="w-5 h-5 text-[var(--on-accent)]" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[var(--ink-1)] font-[var(--font-display)]">项目设置</h1>
          <p className="text-xs text-[var(--ink-3)]">{currentProject?.title || '未加载项目'}</p>
        </div>
      </div>

      <Card className="p-6">
        <h3 className="font-medium text-[var(--ink-1)] mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-[var(--accent)]" /> 创作锁定项
        </h3>
        <p className="text-sm text-[var(--ink-2)] mb-5 leading-relaxed">
          风格和比例在项目创建时锁定，保证全片视觉统一。如需更改请新建项目。
        </p>

        <div className="space-y-4">
          {/* 视觉风格 */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--border)]">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
              <Clapperboard className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-[var(--ink-3)] mb-0.5">视觉风格</p>
              <p className="text-sm font-medium text-[var(--ink-1)]">
                {currentProject?.visual_style || '未设置'}
              </p>
            </div>
            <span className="text-[var(--ink-3)] opacity-70 flex items-center gap-1 text-xs">
              <Lock className="w-3.5 h-3.5" /> 已锁定
            </span>
          </div>

          {/* 画面比例 */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--border)]">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
              <Ratio className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-[var(--ink-3)] mb-0.5">画面比例</p>
              <p className="text-sm font-medium text-[var(--ink-1)]">
                {currentProject?.aspect_ratio || '未设置'}
              </p>
            </div>
            <span className="text-[var(--ink-3)] opacity-70 flex items-center gap-1 text-xs">
              <Lock className="w-3.5 h-3.5" /> 已锁定
            </span>
          </div>

          {/* 输入模式 */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--panel-2)]/50 border border-[var(--border)]">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
              <Type className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-[var(--ink-3)] mb-0.5">输入模式</p>
              <p className="text-sm font-medium text-[var(--ink-1)]">
                {INPUT_MODE_LABELS[currentProject?.input_mode || ''] || currentProject?.input_mode || '未设置'}
              </p>
            </div>
            {currentProject?.input_mode && (
              <Badge variant="accent">{INPUT_MODE_LABELS[currentProject.input_mode] || currentProject.input_mode}</Badge>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 mt-6 p-4 rounded-lg bg-[var(--accent-soft)]/30 border border-[var(--accent)]/20">
          <Info className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--ink-2)] leading-relaxed">
            视觉风格与画面比例在<b>创建项目时锁定</b>，用于统一全片 AI 生成参数，
            避免不同镜头间风格漂移。如需使用不同风格或比例，请新建项目。
          </p>
        </div>
      </Card>
    </div>
  );
}
