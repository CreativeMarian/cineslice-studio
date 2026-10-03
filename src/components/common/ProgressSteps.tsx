import { Check } from 'lucide-react';
import { cn } from '../../utils';

export interface ProgressStepsProps {
  /** 当前阶段索引 0-4 */
  current: number;
  /** 5 个阶段的完成状态 */
  completed: boolean[];
}

const STEPS = ['大纲', '角色', '美术', '剧本', '导演台'];

/** 五段管线进度指示器：已完成绿色✅ / 当前 accent 高亮 / 未完成灰色 */
export function ProgressSteps({ current, completed }: ProgressStepsProps) {
  return (
    <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card-bg)] flex-shrink-0">
      <div className="flex items-center gap-1 max-w-[1400px] mx-auto">
        {STEPS.map((label, index) => {
          const isDone = completed[index] === true;
          const isCurrent = index === current;
          return (
            <div key={label} className="flex items-center flex-1 min-w-0">
              <div
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                  isCurrent
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : isDone
                      ? 'text-[var(--ink-2)]'
                      : 'text-[var(--ink-3)]'
                )}
              >
                <span
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0',
                    isCurrent
                      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                      : isDone
                        ? 'bg-green-500/20 text-green-500'
                        : 'bg-[var(--panel-3)] text-[var(--ink-3)]'
                  )}
                >
                  {isDone ? <Check className="w-3 h-3" /> : index + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={cn('flex-1 h-px mx-1.5', isDone ? 'bg-green-500/40' : 'bg-[var(--border)]')} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
