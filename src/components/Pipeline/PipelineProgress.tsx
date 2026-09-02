import { useMemo } from 'react';
import { Check, Loader2, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import type { PipelineStatusData, PipelineStage, StageStatus } from '../../types';

interface PipelineProgressProps {
  status: PipelineStatusData;
  onStageClick?: (stage: PipelineStage) => void;
  onNext?: () => void;
  onRetry?: () => void;
  onRollback?: () => void;
  compact?: boolean;
}

const STAGE_ICONS: Record<PipelineStage, string> = {
  novel: '📖',
  episodes: '📑',
  script: '📝',
  characters: '👤',
  scenes: '🏞️',
  shots: '🎬',
  keyframes: '🖼️',
  video: '🎥',
};

const STATUS_COLORS: Record<StageStatus, { bg: string; border: string; text: string; label: string }> = {
  pending: { bg: 'bg-[var(--bg-2)]', border: 'border-[var(--border)]', text: 'text-[var(--ink-3)]', label: '待处理' },
  running: { bg: 'bg-blue-500/10', border: 'border-blue-500/50', text: 'text-blue-400', label: '进行中' },
  done: { bg: 'bg-green-500/10', border: 'border-green-500/50', text: 'text-green-400', label: '已完成' },
  failed: { bg: 'bg-red-500/10', border: 'border-red-500/50', text: 'text-red-400', label: '失败' },
  awaiting_confirmation: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/50', text: 'text-yellow-400', label: '待确认' },
};

export function PipelineProgress({
  status,
  onStageClick,
  onNext,
  onRetry,
  onRollback,
  compact = false,
}: PipelineProgressProps) {
  const stages = useMemo(() => status.stages || [], [status.stages]);
  const currentIndex = useMemo(() => {
    const idx = stages.findIndex(s => s.stage === status.current_stage);
    return idx >= 0 ? idx : 0;
  }, [stages, status.current_stage]);

  const progress = useMemo(() => {
    const done = stages.filter(s => s.status === 'done').length;
    return stages.length > 0 ? Math.round((done / stages.length) * 100) : 0;
  }, [stages]);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {stages.map((s, i) => {
          const colors = STATUS_COLORS[s.status];
          return (
            <div
              key={s.stage}
              className={`h-1.5 flex-1 rounded-full transition-all ${colors.bg} ${i <= currentIndex ? colors.border : ''}`}
              title={`${s.stage}: ${colors.label}`}
            />
          );
        })}
        <span className="text-xs text-[var(--ink-3)] ml-2 whitespace-nowrap">{progress}%</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 进度条 */}
      <div className="relative">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-[var(--ink-2)]">流水线进度</span>
          <span className="text-sm text-[var(--ink-3)]">{progress}% ({stages.filter(s => s.status === 'done').length}/{stages.length})</span>
        </div>
        <div className="h-2 bg-[var(--bg-2)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="flex items-start justify-between gap-1 overflow-x-auto pb-2">
        {stages.map((stage, index) => {
          const colors = STATUS_COLORS[stage.status];
          const isCurrent = stage.stage === status.current_stage;
          const isClickable = onStageClick && (stage.status === 'done' || stage.status === 'failed' || isCurrent);

          return (
            <div key={stage.stage} className="flex items-center flex-1 min-w-[70px]">
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStageClick?.(stage.stage)}
                  className={`relative w-9 h-9 rounded-full flex items-center justify-center text-sm border-2 transition-all ${
                    isCurrent ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)] scale-110' : ''
                  } ${colors.bg} ${colors.border} ${isClickable ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}
                >
                  {stage.status === 'done' ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : stage.status === 'running' ? (
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  ) : stage.status === 'failed' ? (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  ) : stage.status === 'awaiting_confirmation' ? (
                    <Clock className="w-4 h-4 text-yellow-400" />
                  ) : (
                    <span className="text-xs">{index + 1}</span>
                  )}
                </button>
                <span className={`text-[10px] text-center leading-tight ${colors.text} font-medium`}>
                  {STAGE_ICONS[stage.stage]} {stage.stage}
                </span>
                <span className={`text-[9px] ${colors.text}`}>{colors.label}</span>
              </div>
              {index < stages.length - 1 && (
                <ChevronRight className={`w-4 h-4 flex-shrink-0 -mt-5 ${
                  stage.status === 'done' ? 'text-green-400' : 'text-[var(--ink-4)]'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* 当前阶段错误信息 */}
      {status.overall_status === 'failed' && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {stages.find(s => s.status === 'failed')?.error || '流水线执行失败'}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        {status.overall_status === 'awaiting_confirmation' && onNext && (
          <button
            onClick={onNext}
            className="flex-1 px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            确认并进入下一阶段
          </button>
        )}
        {status.overall_status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
          >
            重试失败阶段
          </button>
        )}
        {onRollback && currentIndex > 0 && (
          <button
            onClick={onRollback}
            className="px-4 py-2 border border-[var(--border)] text-[var(--ink-2)] rounded-lg text-sm font-medium hover:bg-[var(--bg-2)] transition-colors"
          >
            回退
          </button>
        )}
      </div>
    </div>
  );
}
