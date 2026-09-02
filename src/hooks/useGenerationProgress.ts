// 生成进度状态 Hook：自动计时 + 分阶段模拟进度，配合 <GenerationProgress /> 组件使用
// 从 ui/GenerationProgress.tsx 拆出，保持组件文件只导出组件（react-refresh 友好）

import { useEffect, useRef, useState, useCallback } from 'react';

export const DEFAULT_STAGES = [
  { label: '正在连接 AI 服务...', startAt: 0, duration: 2 },
  { label: '正在分析内容...', startAt: 2, duration: 10 },
  { label: 'AI 正在生成...', startAt: 12, duration: 20 },
  { label: '正在整理结果...', startAt: 32, duration: 15 },
  { label: '即将完成...', startAt: 47, duration: 999 },
];

export function calculateProgress(elapsed: number, stages: Array<{ label: string; startAt: number; duration: number }>): { progress: number; stage: string } {
  let progress = 5;
  let stage = stages[0]?.label || '正在处理...';

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    if (elapsed >= s.startAt) {
      const next = stages[i + 1];
      const segmentEnd = next ? next.startAt : s.startAt + s.duration;
      const segmentProgress = Math.min((elapsed - s.startAt) / (segmentEnd - s.startAt), 1);
      const baseProgress = i === 0 ? 5 : (i / stages.length) * 90 + 5;
      const segmentRange = (1 / stages.length) * 90;
      progress = baseProgress + segmentProgress * segmentRange;
      stage = s.label;
    }
  }

  return { progress: Math.min(progress, 95), stage };
}

/**
 * Hook for managing generation progress state with automatic timing and stage simulation.
 * Returns state and helpers to use with GenerationProgress component.
 */
export function useGenerationProgress(defaultStages?: Array<{ label: string; startAt: number; duration: number }>) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback((initialStage?: string) => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);
    setProgress(5);
    setElapsed(0);
    setStage(initialStage || '正在连接 AI 服务...');

    const startTime = Date.now();
    const stages = defaultStages || DEFAULT_STAGES;

    timerRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - startTime) / 1000);
      setElapsed(e);
      const calc = calculateProgress(e, stages);
      setProgress(calc.progress);
      setStage(calc.stage);
    }, 500);
  }, [defaultStages]);

  const finish = useCallback((successMsg?: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
    setStage('生成完成！');
    if (successMsg) setSuccess(successMsg);
    setTimeout(() => {
      setIsGenerating(false);
      setStage('');
      setProgress(0);
      setElapsed(0);
      setSuccess(null);
    }, 1500);
  }, []);

  const fail = useCallback((errorMsg: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setError(errorMsg);
    setTimeout(() => {
      setIsGenerating(false);
      setError(null);
      setStage('');
      setProgress(0);
      setElapsed(0);
    }, 3000);
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  return {
    isGenerating,
    stage,
    progress,
    elapsed,
    error,
    success,
    start,
    finish,
    fail,
    setStage,
    setProgress,
  };
}
