import { useEffect, useRef, useState } from 'react';
import { Sparkles, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Card } from './Card';
import { cn } from '../../utils';
// 进度条：传入 progress 显示真实百分比；不传则 indeterminate 模式（CSS 动画，不模拟数据）

export interface GenerationProgressProps {
  /** 是否正在生成 */
  isGenerating: boolean;
  /** 当前阶段文字 */
  stage?: string;
  /** 进度百分比 0-100 */
  progress?: number;
  /** 已用时间（秒），不传则自动计时 */
  elapsed?: number;
  /** 模型名称 */
  modelName?: string;
  /** 错误信息，传入则显示错误状态 */
  error?: string | null;
  /** 成功信息，传入则显示成功状态 */
  success?: string | null;
  /** 附加信息行，如"已选择 3 个章节" */
  meta?: string;
  /** 图标 */
  icon?: React.ReactNode;
  /** 紧凑模式（用于卡片内） */
  compact?: boolean;
  /** 自定义 className */
  className?: string;
}

export function GenerationProgress({
  isGenerating,
  stage: stageProp,
  progress: progressProp,
  elapsed: elapsedProp,
  modelName,
  error,
  success,
  meta,
  icon,
  compact = false,
  className,
}: GenerationProgressProps) {
  const [autoElapsed, setAutoElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 自动计时
  useEffect(() => {
    if (isGenerating && elapsedProp === undefined) {
      setAutoElapsed(0);
      timerRef.current = setInterval(() => {
        setAutoElapsed((prev) => prev + 1);
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [isGenerating, elapsedProp]);

  const elapsed = elapsedProp !== undefined ? elapsedProp : autoElapsed;

  // 进度：传入真实 progress 则显示百分比；不传则 indeterminate 模式（不模拟数据）
  const progress = progressProp;
  const isIndeterminate = progress === undefined;
  const stage = stageProp || '正在处理...';

  const isError = !!error;
  const isSuccess = !!success && !isGenerating;

  if (!isGenerating && !error && !success) return null;

  const statusColor = isError
    ? 'border-[var(--danger)]/40 bg-[var(--danger)]/10'
    : isSuccess
    ? 'border-[var(--success)]/40 bg-[var(--success)]/10'
    : 'border-[var(--border)]';

  const iconColor = isError
    ? 'text-[var(--danger)]'
    : isSuccess
    ? 'text-[var(--success)]'
    : 'text-[var(--accent)]';

  const barColor = isError
    ? 'bg-[var(--danger)]'
    : isSuccess
    ? 'bg-[var(--success)]'
    : 'bg-[var(--accent)]';

  const displayStage = isError ? `生成失败: ${error}` : isSuccess ? success : stage;

  if (compact) {
    return (
      <div className={cn('p-2 rounded-lg border bg-[var(--panel-2)]', statusColor, className)}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className={cn('flex-shrink-0', iconColor)}>
            {isError ? (
              <AlertCircle className="w-4 h-4" />
            ) : isSuccess ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : icon ? (
              <span className={isGenerating ? 'animate-pulse' : ''}>{icon}</span>
            ) : (
              <Sparkles className={cn('w-4 h-4', isGenerating && 'animate-pulse')} />
            )}
          </div>
          <p className={cn('text-xs font-medium flex-1 truncate', isError ? 'text-[var(--danger)]' : isSuccess ? 'text-[var(--success)]' : 'text-[var(--ink-1)]')}>
            {displayStage}
          </p>
          {!isError && !isSuccess && !isIndeterminate && (
            <span className="text-[10px] text-[var(--ink-2)] flex-shrink-0">
              {Math.round(progress)}%
            </span>
          )}
        </div>
        {!isError && !isSuccess && (
          <div className="w-full h-1 bg-[var(--border)] rounded-full overflow-hidden relative">
            {isIndeterminate ? (
              <div className={cn('h-full rounded-full progress-indeterminate', barColor)} />
            ) : (
              <div
                className={cn('h-full rounded-full transition-all duration-500 ease-out', barColor)}
                style={{ width: `${progress}%` }}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={cn('p-4', statusColor, className)}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0', isError && 'bg-[var(--danger)]/10', isSuccess && 'bg-[var(--success)]/10')}>
          {isError ? (
            <AlertCircle className={cn('w-5 h-5', iconColor)} />
          ) : isSuccess ? (
            <CheckCircle2 className={cn('w-5 h-5', iconColor)} />
          ) : icon ? (
            <span className={cn(iconColor, isGenerating && 'animate-pulse')}>{icon}</span>
          ) : (
            <Sparkles className={cn('w-5 h-5', iconColor, isGenerating && 'animate-pulse')} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold truncate', isError ? 'text-[var(--danger)]' : isSuccess ? 'text-[var(--success)]' : 'text-[var(--ink-1)]')}>
            {displayStage}
          </p>
          <p className="text-xs text-[var(--ink-3)] flex items-center gap-2 mt-0.5">
            {meta && <span className="truncate">{meta}</span>}
            {meta && !isError && !isSuccess && <span>·</span>}
            {!isError && !isSuccess && (
              <>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  已用时 {elapsed}s
                </span>
                <span>·</span>
                {!isIndeterminate && <span>{Math.round(progress)}%</span>}
              </>
            )}
          </p>
        </div>
        {modelName && !isError && !isSuccess && (
          <div className="text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-2 py-1 rounded flex-shrink-0">
            {modelName}
          </div>
        )}
      </div>
      {!isError && !isSuccess && (
        <div className="w-full h-1 bg-[var(--border)] rounded-full overflow-hidden relative">
          {isIndeterminate ? (
            <div className={cn('h-full rounded-full progress-indeterminate', barColor)} />
          ) : (
            <div
              className={cn('h-full rounded-full transition-all duration-500 ease-out', barColor)}
              style={{ width: `${progress}%` }}
            />
          )}
        </div>
      )}
    </Card>
  );
}

