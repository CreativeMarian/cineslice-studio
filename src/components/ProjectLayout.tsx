import { useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useProjectStore } from '../stores/useProjectStore';
import { useUIStore } from '../stores/useUIStore';
import { LoadingState } from './ui';
import { PipelineProgress } from './Pipeline/PipelineProgress';
import { pipelineService, type ProjectProgressData } from '../services/pipelineService';
import { Button } from './ui';
import { Zap, RefreshCw, AlertTriangle, CheckCircle2, Loader2, ArrowRight, PartyPopper } from 'lucide-react';
import type { PipelineStatusData, PipelineMode } from '../types';

// 阶段中文名称映射
// 各阶段预估时长（分钟）：用于一键全自动启动时提示"大概时间"（估算值，非实时数据）
const STAGE_EST_MIN: Record<string, number> = {
  novel: 1,
  episodes: 2,
  script: 3,
  characters: 2,
  scenes: 1,
  shots: 8,
  keyframes: 12,
  audio: 4,
  video: 25,
};
const PIPELINE_ORDER = ['novel', 'episodes', 'script', 'characters', 'scenes', 'shots', 'keyframes', 'audio', 'video'];

// 估算：从 startStage（含）到结束的未完成阶段总时长
function estimateMinutesFrom(progressData: ProjectProgressData | null, startStage: string | null): number {
  if (!progressData) return 0;
  const startIdx = startStage ? PIPELINE_ORDER.indexOf(startStage) : 0;
  let total = 0;
  for (let i = Math.max(0, startIdx); i < PIPELINE_ORDER.length; i++) {
    const st = PIPELINE_ORDER[i];
    const done = progressData.stages[st]?.done;
    if (done) continue; // 已完成阶段跳过
    total += STAGE_EST_MIN[st] || 0;
  }
  return total;
}

const STAGE_LABELS: Record<string, string> = {
  novel: '小说上传',
  episodes: '剧集拆分',
  script: '剧本生成',
  characters: '角色设定',
  scenes: '场景设定',
  shots: '分镜生成',
  keyframes: '关键帧',
  audio: '配音生成',
  video: '视频生成',
};

export function ProjectLayout() {
  const { projectId } = useParams();
  const { currentProject, isLoading, loadProjectData, clear } = useProjectStore();
  const { setSidebarCollapsed } = useUIStore();
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatusData | null>(null);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('semi-auto');
  const [autoTaskId, setAutoTaskId] = useState<string | null>(null);
  const [autoTaskStatus, setAutoTaskStatus] = useState<{ currentStage: string; stageProgress: Record<string, string>; status: string; error?: string } | null>(null);
  const [progressData, setProgressData] = useState<ProjectProgressData | null>(null);
  const navigate = useNavigate();

  // 真实数据完成度：步骤门控与下一步引导（独立于流水线状态机，手动操作也生效）
  const loadProgress = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await pipelineService.getProgress(projectId);
      if (res.success && res.data) setProgressData(res.data);
    } catch { /* 静默 */ }
  }, [projectId]);

  useEffect(() => { loadProgress(); }, [projectId, loadProgress]);

  // 下一步引导：文案 + 目标页面（按第一个未完成的真实阶段）
  const NEXT_STEP_MAP: Record<string, { text: string; path: string }> = {
    novel: { text: '上传小说并拆分剧集', path: 'script' },
    episodes: { text: '拆分剧集并生成剧本', path: 'script' },
    script: { text: '生成剧本与分镜', path: 'script' },
    characters: { text: '提取角色与场景资产', path: 'assets' },
    scenes: { text: '补充场景设定', path: 'assets' },
    shots: { text: '生成分镜', path: 'script' },
    keyframes: { text: '生成关键帧', path: 'director' },
    video: { text: '生成视频', path: 'director' },
  };
  const nextStep = progressData
    ? (progressData.firstPending ? NEXT_STEP_MAP[progressData.firstPending] : null)
    : null;
  const nextStageLabel = progressData
    ? (progressData.firstPending ? progressData.stages[progressData.firstPending]?.label || progressData.firstPending : null)
    : null;


  // in-flight 守卫：轮询 + 手动刷新共用 loadPipeline，慢响应乱序覆盖会被此挡住
  const loadPipelineInFlight = useRef(false);
  const loadPipeline = useCallback(async () => {
    if (!projectId || loadPipelineInFlight.current) return;
    loadPipelineInFlight.current = true;
    try {
      const res = await pipelineService.getStatus(projectId);
      if (res.success && res.data) {
        setPipelineStatus({
          current_stage: res.data.current_stage,
          stages: res.data.stages,
          overall_status: res.data.overall_status,
          last_updated: res.data.last_updated,
        });
        setPipelineMode(res.data.mode || 'semi-auto');
      }
    } catch {
      // 静默处理
    } finally {
      loadPipelineInFlight.current = false;
    }
  }, [projectId]);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, [setSidebarCollapsed]);

  useEffect(() => {
    if (projectId) {
      loadProjectData(projectId);
      loadPipeline();
    }
    return () => {
      clear();
    };
  }, [projectId, loadProjectData, clear, loadPipeline]);

  // 运行中自动刷新
  useEffect(() => {
    if (!pipelineStatus || pipelineStatus.overall_status !== 'running') return;
    const timer = setInterval(loadPipeline, 3000);
    return () => clearInterval(timer);
  }, [pipelineStatus, loadPipeline]);

  // 页面加载时恢复运行中或中断的全自动任务
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await pipelineService.getCurrentAutoRun(projectId);
        if (cancelled || !res.success || !res.data) return;
        if (res.data.status === 'running') {
          setAutoTaskId(res.data.taskId);
          setAutoTaskStatus({
            currentStage: res.data.currentStage,
            stageProgress: res.data.stageProgress,
            status: res.data.status,
            error: res.data.error,
          });
          setPipelineMode('auto');
          useUIStore.getState().showToast('检测到运行中的全自动任务，已恢复进度跟踪', 'info');
        } else if (res.data.status === 'interrupted') {
          // 中断的任务：显示恢复提示
          setAutoTaskId(res.data.taskId);
          setAutoTaskStatus({
            currentStage: res.data.currentStage,
            stageProgress: res.data.stageProgress,
            status: res.data.status,
            error: res.data.error,
          });
          setPipelineMode('auto');
          useUIStore.getState().showToast('检测到中断的全自动任务，可点击恢复继续', 'warning');
        }
      } catch {
        // 静默处理
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // 恢复中断的全自动任务
  const handleResumeAuto = async () => {
    if (!projectId || !autoTaskId) return;
    try {
      const res = await pipelineService.resumeAutoRun(projectId, autoTaskId);
      if (res.success && res.data) {
        setAutoTaskStatus({
          currentStage: res.data.currentStage,
          stageProgress: res.data.stageProgress || {},
          status: 'running',
        });
        useUIStore.getState().showToast(`任务已恢复，从阶段 ${STAGE_LABELS[res.data.currentStage] || res.data.currentStage} 继续`, 'success');
        loadPipeline();
      }
    } catch {
      useUIStore.getState().showToast('恢复任务失败', 'error');
    }
  };

  const handleCancelAuto = async () => {
    if (!projectId || !autoTaskId) return;
    try {
      await pipelineService.cancelAutoRun(projectId, autoTaskId);
      useUIStore.getState().showToast('全自动任务已取消', 'success');
      setAutoTaskId(null);
      setAutoTaskStatus(null);
      loadPipeline();
    } catch {
      useUIStore.getState().showToast('取消失败', 'error');
    }
  };

  // 流水线状态机操作的 in-flight 锁：双击"确认并进入下一阶段"会连跳两个阶段（付费 AI 操作）
  const [pipelineActionBusy, setPipelineActionBusy] = useState(false);
  const guardedAction = (fn: () => Promise<void>) => {
    if (pipelineActionBusy) return;
    setPipelineActionBusy(true);
    fn().finally(() => setPipelineActionBusy(false));
  };

  const handleNext = () => guardedAction(async () => {
    if (!projectId) return;
    const res = await pipelineService.next(projectId);
    if (res.success && res.data) setPipelineStatus(res.data);
  });

  const handleRetry = () => guardedAction(async () => {
    if (!projectId) return;
    const res = await pipelineService.retry(projectId);
    if (res.success && res.data) setPipelineStatus(res.data);
  });

  const handleRollback = () => guardedAction(async () => {
    if (!projectId) return;
    const res = await pipelineService.rollback(projectId);
    if (res.success && res.data) setPipelineStatus(res.data);
  });

  const handleResetPipeline = async () => {
    if (!projectId) return;
    try {
      const res = await pipelineService.reset(projectId);
      if (res.success && res.data) {
        setPipelineStatus(res.data);
        useUIStore.getState().showToast('流水线已重置', 'success');
      }
    } catch {
      useUIStore.getState().showToast('重置失败', 'error');
    }
  };

  const handleToggleMode = async () => {
    if (!projectId) return;
    const newMode: PipelineMode = pipelineMode === 'auto' ? 'semi-auto' : 'auto';
    try {
      const res = await pipelineService.setMode(projectId, newMode);
      if (res.success) {
        setPipelineMode(newMode);
        useUIStore.getState().showToast(
          newMode === 'auto' ? '已切换为全自动模式' : '已切换为半自动模式',
          'success'
        );
      }
    } catch {
      useUIStore.getState().showToast('切换模式失败', 'error');
    }
  };

  const handleStartAuto = async () => {
    if (!projectId || pipelineActionBusy) return;
    setPipelineActionBusy(true);
    try {
    // 如果流水线已完成或失败，先重置再启动
    if (pipelineStatus && (pipelineStatus.overall_status === 'done' || pipelineStatus.overall_status === 'failed')) {
      try {
        await pipelineService.reset(projectId);
      } catch {
        // 重置失败不影响启动
      }
    }
      const res = await pipelineService.autoRun(projectId);
      if (res.success && res.data) {
        setAutoTaskId(res.data.taskId);
        setPipelineMode('auto');
        // 预估时间：基于真实完成度（已完成阶段自动跳过，只算剩余阶段）
        try {
          const pRes = await pipelineService.getProgress(projectId);
          if (pRes.success && pRes.data) {
            const pd = pRes.data;
            setProgressData(pd);
            const est = estimateMinutesFrom(pd, null);
            const skipCount = PIPELINE_ORDER.filter(st => pd.stages[st]?.done).length;
            useUIStore.getState().showToast(
              skipCount > 0
                ? `全自动流水线已启动！${skipCount} 个阶段已存在将自动跳过，预计约 ${Math.max(est, 1)} 分钟完成（视模型速度）`
                : `全自动流水线已启动！预计约 ${Math.max(est, 1)} 分钟完成（视模型速度）`,
              'success', { duration: 6000 }
            );
          } else {
            useUIStore.getState().showToast('全自动流水线已启动！正在自动执行所有阶段', 'success');
          }
        } catch {
          useUIStore.getState().showToast('全自动流水线已启动！正在自动执行所有阶段', 'success');
        }
        loadPipeline();
      }
    } catch {
      useUIStore.getState().showToast('启动全自动流水线失败', 'error');
    } finally {
      setPipelineActionBusy(false);
    }
  };

  // 全自动任务状态轮询
  useEffect(() => {
    if (!autoTaskId || !projectId) return;
    let cancelled = false;
    let inFlight = false; // 上一个请求未返回时跳过本轮，防止慢响应乱序覆盖
    let failures = 0;     // 连续失败熔断
    const poll = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const res = await pipelineService.getAutoRunStatus(projectId, autoTaskId);
        if (cancelled || !res.success || !res.data) return;
        failures = 0;
        setAutoTaskStatus({
          currentStage: res.data.currentStage,
          stageProgress: res.data.stageProgress,
          status: res.data.status,
          error: res.data.error,
        });
        // 同步刷新流水线状态
        loadPipeline();
        if (res.data.status === 'completed') {
          useUIStore.getState().showToast('全自动流水线执行完成！', 'success');
          setAutoTaskId(null);
        } else if (res.data.status === 'failed') {
          useUIStore.getState().showToast(`全自动流水线失败: ${res.data.error || '未知错误'}`, 'error');
          setAutoTaskId(null);
        } else if (res.data.status === 'cancelled') {
          useUIStore.getState().showToast('全自动流水线已取消', 'info');
          setAutoTaskId(null);
        } else if (res.data.status === 'interrupted') {
          // interrupted 是待用户确认的稳态，继续 3s 轮询毫无意义
          setAutoTaskId(null);
        }
      } catch {
        failures += 1;
        if (failures >= 10) {
          // 约 30 秒持续失败（后端下线/网络中断），停止轮询
          setAutoTaskId(null);
          useUIStore.getState().showToast('无法获取全自动任务进度，已停止跟踪', 'warning');
        }
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(poll, 3000);
    poll(); // 立即执行一次
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [autoTaskId, projectId, loadPipeline]);

  if (isLoading && !currentProject) {
    return <LoadingState message="加载项目..." />;
  }

  return (
    <div className="h-screen flex bg-[var(--page)] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar />
        {/* 流水线进度条 */}
        {pipelineStatus && (
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--card-bg)]">
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleMode}
                className={`text-xs font-medium whitespace-nowrap px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                  pipelineMode === 'auto'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent-soft)]/80'
                    : 'bg-[var(--panel-2)] text-[var(--ink-3)] hover:bg-[var(--panel-3)]'
                }`}
                title="点击切换全自动/半自动模式"
              >
                <Zap className="w-3 h-3" />
                {pipelineMode === 'auto' ? '全自动' : '半自动'}
              </button>
              {/* 一键全自动按钮：没有运行中任务时显示 */}
              {!autoTaskStatus || autoTaskStatus.status !== 'running' ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    leftIcon={<Zap className="w-3 h-3 flex-shrink-0" />}
                    onClick={handleStartAuto}
                    className="!px-2 !py-1 !text-xs"
                  >
                    {pipelineStatus && (pipelineStatus.overall_status === 'done' || pipelineStatus.overall_status === 'failed')
                      ? '重新全自动'
                      : '一键全自动'}
                  </Button>
                  {pipelineStatus && pipelineStatus.overall_status !== 'pending' && (
                    <button
                      onClick={handleResetPipeline}
                      className="px-2 py-1 text-xs text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-2)] rounded transition-colors whitespace-nowrap flex-shrink-0"
                      title="重置流水线状态"
                    >
                      重置
                    </button>
                  )}
                </div>
              ) : null}
              <div className="flex-1">
                <PipelineProgress
                  status={pipelineStatus}
                  compact
                  onNext={handleNext}
                  onRetry={handleRetry}
                  onRollback={handleRollback}
                />
              </div>
            </div>
            {/* 全自动执行进度详情 */}
            {autoTaskStatus && (autoTaskStatus.status === 'running' || autoTaskStatus.status === 'interrupted') && (
              <div className="mt-2 p-3 bg-gradient-to-r from-[var(--accent-soft)]/30 to-transparent rounded-lg border border-[var(--accent-soft)]">
                <div className="flex items-center gap-2 text-xs mb-2">
                  {autoTaskStatus.status === 'running' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
                      <span className="text-[var(--ink-2)]">正在执行：</span>
                      <span className="text-[var(--accent)] font-semibold">{STAGE_LABELS[autoTaskStatus.currentStage] || autoTaskStatus.currentStage}</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="text-yellow-600 dark:text-yellow-400">任务中断：</span>
                      <span className="text-[var(--ink-2)]">{STAGE_LABELS[autoTaskStatus.currentStage] || autoTaskStatus.currentStage}</span>
                      <span className="text-[var(--ink-3)]">— {autoTaskStatus.error || '服务器重启导致中断'}</span>
                    </>
                  )}
                  {autoTaskStatus.stageProgress[autoTaskStatus.currentStage] && (
                    <span className="text-[var(--ink-3)] ml-1">— {autoTaskStatus.stageProgress[autoTaskStatus.currentStage]}</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {autoTaskStatus.status === 'interrupted' ? (
                      <button
                        onClick={handleResumeAuto}
                        className="px-3 py-1 bg-[var(--accent)] text-white rounded text-xs font-medium hover:opacity-90 flex items-center gap-1 transition-opacity"
                        title="从断点恢复任务"
                      >
                        <RefreshCw className="w-3 h-3" />
                        恢复任务
                      </button>
                    ) : (
                      <button
                        onClick={handleCancelAuto}
                        className="px-2 py-0.5 text-red-500 hover:bg-red-50 rounded text-xs font-medium border border-red-200 hover:border-red-300 transition-colors"
                        title="取消全自动流水线"
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
                {/* 进度条：显示9阶段完成进度 */}
                <div className="flex items-center gap-1">
                  {Object.keys(STAGE_LABELS).map((stage, idx) => {
                    const stageIdx = Object.keys(STAGE_LABELS).indexOf(autoTaskStatus.currentStage);
                    const isCompleted = idx < stageIdx;
                    const isCurrent = idx === stageIdx;
                    return (
                      <div
                        key={stage}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                          isCompleted
                            ? 'bg-[var(--accent)]'
                            : isCurrent
                            ? 'bg-[var(--accent)]/60 animate-pulse'
                            : 'bg-[var(--border)]'
                        }`}
                        title={STAGE_LABELS[stage]}
                      />
                    );
                  })}
                </div>
                {/* 阶段统计 */}
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--ink-3)]">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    {Object.keys(STAGE_LABELS).indexOf(autoTaskStatus.currentStage)} 阶段已完成
                  </span>
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 text-[var(--accent)]" />
                    当前：{STAGE_LABELS[autoTaskStatus.currentStage] || autoTaskStatus.currentStage}
                  </span>
                  <span className="flex items-center gap-1">
                    {Object.keys(STAGE_LABELS).length - Object.keys(STAGE_LABELS).indexOf(autoTaskStatus.currentStage) - 1} 阶段待执行
                    <span className="text-[var(--accent)] font-medium">
                      · 预计剩余约 {estimateMinutesFrom(progressData, autoTaskStatus.currentStage)} 分钟
                    </span>
                  </span>
                </div>
              </div>
            )}
            {/* 非紧凑模式的操作按钮区域 */}
            {(pipelineStatus.overall_status === 'awaiting_confirmation' || pipelineStatus.overall_status === 'failed') && (
              <div className="flex gap-2 mt-2">
                {pipelineStatus.overall_status === 'awaiting_confirmation' && (
                  <button
                    onClick={handleNext}
                    className="px-3 py-1 bg-[var(--accent)] text-white rounded text-xs font-medium hover:opacity-90"
                  >
                    确认并进入下一阶段
                  </button>
                )}
                {pipelineStatus.overall_status === 'failed' && (
                  <button
                    onClick={handleRetry}
                    className="px-3 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600"
                  >
                    重试失败阶段
                  </button>
                )}
                <button
                  onClick={handleRollback}
                  className="px-3 py-1 border border-[var(--border)] text-[var(--ink-2)] rounded text-xs font-medium hover:bg-[var(--panel-2)]"
                >
                  回退
                </button>
              </div>
            )}
          </div>
        )}
        {/* 下一步引导条：基于真实数据完成度，提示用户下一步该做什么 */}
        {progressData && (
          <div className="px-4 py-2 border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-soft)]/40 via-[var(--card-bg)] to-[var(--card-bg)]">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-semibold text-[var(--ink-3)] uppercase tracking-wider whitespace-nowrap">
                  完成度 {progressData.completedCount}/{progressData.totalStages}
                </span>
                <div className="w-28 h-1.5 bg-[var(--panel-3)] rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all duration-500"
                    style={{ width: `${Math.round((progressData.completedCount / progressData.totalStages) * 100)}%` }}
                  />
                </div>
              </div>
              {nextStep ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />
                  <span className="text-xs text-[var(--ink-2)] truncate">
                    下一步：<span className="font-semibold text-[var(--ink-1)]">{nextStageLabel}</span> — {nextStep.text}
                  </span>
                  <button
                    onClick={() => navigate(`/projects/${projectId}/${nextStep.path}`)}
                    className="ml-auto flex-shrink-0 px-3 py-1 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    去执行
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <PartyPopper className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <span className="text-xs text-[var(--ink-2)] truncate">
                    全部阶段已完成！下一步：<span className="font-semibold text-[var(--ink-1)]">导出成片</span>
                  </span>
                  <button
                    onClick={() => navigate(`/projects/${projectId}/export`)}
                    className="ml-auto flex-shrink-0 px-3 py-1 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    去导出
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
