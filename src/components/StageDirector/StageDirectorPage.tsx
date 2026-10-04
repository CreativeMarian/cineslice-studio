// 第 5 段 · 导演台：三栏布局（左：剧集/分段列表 · 中：分镜卡片流 · 右：选中镜头详情面板）
// 功能保持不变：段 → 分镜 → 首帧 → 视频，一键导出投产包，全自动流水线，分段视图
// 分镜按段分组：优先 segment_id（后端段概念，与导出服务一致），其次 phase（剧情阶段），最后按累计 ≤15 秒兜底
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clapperboard, Film, ChevronDown, ChevronRight, ArrowRight, BookOpen,
  List, LayoutGrid, RefreshCw, Video, AlertCircle, Rocket, MousePointerClick,
} from 'lucide-react';
import { Card, EmptyState, Badge, Spinner, Button, Modal } from '../ui';
import { SectionHeader } from '../common/SectionHeader';
import { EpisodeSelector } from '../common/EpisodeSelector';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { useModelStore } from '../../stores/useModelStore';
import { BatchToolbar } from './BatchToolbar';
import { ShotCard } from './ShotCard';
import { ShotDetailPanel } from './ShotDetailPanel';
import { ExportPackageModal } from './ExportPackageModal';
import { segmentService } from '../../services/segmentService';
import { pipelineService } from '../../services/pipelineService';
import { videoService, type ShotVideoInterval } from '../../services/videoService';
import { usePolling } from '../../hooks/usePolling';
import { showApiError, getResponseErrorMessage } from '../../utils/error';
import type { Shot, Segment } from '../../types';

const SEGMENT_STATUS_LABELS: Record<Segment['status'], string> = {
  pending: '待生成',
  generating: '生成中',
  completed: '已完成',
  failed: '生成失败',
};

const SEGMENT_STATUS_VARIANTS: Record<Segment['status'], 'default' | 'info' | 'success' | 'danger'> = {
  pending: 'default',
  generating: 'info',
  completed: 'success',
  failed: 'danger',
};

/** P2-前端5: 全自动流水线阶段中文标签 */
const AUTO_STAGE_LABELS: Record<string, string> = {
  novel: '小说解析',
  episodes: '剧集拆分',
  script: '剧本生成',
  characters: '角色设定',
  scenes: '场景设定',
  shots: '分镜生成',
  keyframes: '关键帧生成',
  video: '视频生成',
  audio: '配音生成',
  export: '合成导出',
};

type GroupStatus = 'idle' | 'generating' | 'done' | 'failed';

interface ShotSegment {
  key: string;
  label: string;
  phaseName?: string | null;
  shots: Shot[];
  totalDuration: number;
}

function sumDuration(shots: Shot[]): number {
  return Math.round(shots.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) * 10) / 10;
}

/** 分镜按段分组（段 ≤15 秒：逻辑分组，每段内每镜 2-5 秒） */
function groupShotsIntoSegments(shots: Shot[]): ShotSegment[] {
  if (shots.length === 0) return [];

  // 1) 后端段概念：segment_id（导出服务同款分组逻辑）
  const hasSegmentIds = shots.some(s => {
    const v = (s as unknown as { segment_id?: number | null }).segment_id;
    return typeof v === 'number' && v > 0;
  });
  if (hasSegmentIds) {
    const map = new Map<number, Shot[]>();
    for (const shot of shots) {
      const id = (shot as unknown as { segment_id?: number | null }).segment_id ?? 1;
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(shot);
    }
    return [...map.keys()].sort((a, b) => a - b).map(id => ({
      key: `seg-${id}`,
      label: `第${id}段`,
      shots: map.get(id)!,
      totalDuration: sumDuration(map.get(id)!),
    }));
  }

  // 2) 剧情阶段（phase 1-4）
  const hasPhases = shots.some(s => s.phase && s.phase > 0);
  if (hasPhases) {
    const map = new Map<number, Shot[]>();
    for (const shot of shots) {
      const p = shot.phase && shot.phase > 0 ? shot.phase : 1;
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(shot);
    }
    return [...map.keys()].sort((a, b) => a - b).map(p => {
      const segShots = map.get(p)!;
      return {
        key: `phase-${p}`,
        label: `第${p}段`,
        phaseName: segShots.find(s => s.phase_name)?.phase_name || null,
        shots: segShots,
        totalDuration: sumDuration(segShots),
      };
    });
  }

  // 3) 兜底：累计 ≤15 秒一组（AI 视频单段生成上限）
  const fallback: ShotSegment[] = [];
  let current: Shot[] = [];
  let acc = 0;
  let no = 1;
  for (const shot of shots) {
    if (current.length > 0 && acc + (shot.duration_seconds || 0) > 15) {
      fallback.push({ key: `group-${no}`, label: `第${no}段`, shots: current, totalDuration: acc });
      current = [];
      acc = 0;
      no += 1;
    }
    current.push(shot);
    acc += shot.duration_seconds || 0;
  }
  if (current.length > 0) {
    fallback.push({ key: `group-${no}`, label: `第${no}段`, shots: current, totalDuration: acc });
  }
  return fallback;
}

/** 段状态（按段内镜头视频状态汇总）：生成中 > 失败 > 全完成 > 未生成 */
function groupStatusOf(
  groupShots: Shot[],
  videosByShot: Record<string, ShotVideoInterval[]>
): GroupStatus {
  let generating = false;
  let failed = false;
  let done = 0;
  for (const s of groupShots) {
    const videos = videosByShot[s.id] || [];
    if (videos.some((v) => v.status === 'processing' || v.status === 'pending' || v.status === 'generating')) {
      generating = true;
      continue;
    }
    if (videos.some((v) => v.status === 'failed')) {
      failed = true;
      continue;
    }
    if (videos.some((v) => v.status === 'completed')) done += 1;
  }
  if (generating) return 'generating';
  if (failed) return 'failed';
  if (groupShots.length > 0 && done === groupShots.length) return 'done';
  return 'idle';
}

const GROUP_STATUS_META: Record<GroupStatus, { dot: string; label: string }> = {
  idle: { dot: 'bg-[var(--ink-3)]', label: '未生成' },
  generating: { dot: 'bg-[var(--accent)] animate-pulse', label: '生成中' },
  done: { dot: 'bg-[var(--success)]', label: '已完成' },
  failed: { dot: 'bg-[var(--danger)]', label: '失败' },
};

/** 响应式：视口是否达到 xl（决定右侧详情面板以侧栏还是弹窗呈现，保证小屏不丢失编辑功能） */
function useIsXl() {
  const [isXl, setIsXl] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const fn = (e: MediaQueryListEvent) => setIsXl(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return isXl;
}

export function StageDirectorPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { shots, currentEpisodeId, episodes, setCurrentEpisode, loadShots, loadAllKeyframes, loadAllVideos, setAutoRunActive, keyframesByShot, videosByShot } = useProjectStore();
  const { showToast } = useUIStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingShots, setLoadingShots] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const isXl = useIsXl();

  // 右侧详情面板：当前选中镜头
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  // ── P2-前端5: 一键全自动流水线状态 ──
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoRunTaskId, setAutoRunTaskId] = useState<string | null>(null);
  const [autoRunStage, setAutoRunStage] = useState('');
  const [autoRunStageProgress, setAutoRunStageProgress] = useState<Record<string, string>>({});
  const [autoRunError, setAutoRunError] = useState<string | null>(null);

  // ── P2-2: 分段视图 ──
  const [view, setView] = useState<'shots' | 'segments'>('shots');
  const [segmentList, setSegmentList] = useState<Segment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [aggregating, setAggregating] = useState(false);
  const [generatingSegmentId, setGeneratingSegmentId] = useState<string | null>(null);
  // 左栏当前高亮分段
  const [activeSegmentKey, setActiveSegmentKey] = useState<string | null>(null);
  // P2-前端2: 分段轮询断网退避（连续失败≥3次降频到30s，≥6次暂停显示重试）
  const [segConnectionLost, setSegConnectionLost] = useState(false);
  const [segPollRetryTick, setSegPollRetryTick] = useState(0);
  const { configs: modelConfigs, loadConfigs: loadModelConfigs } = useModelStore();

  // 加载分段列表
  const loadSegments = useCallback(async () => {
    if (!currentEpisodeId) return;
    setLoadingSegments(true);
    try {
      const res = await segmentService.getSegments(currentEpisodeId);
      if (res.success) setSegmentList(res.data || []);
    } catch {
      setSegmentList([]);
    } finally {
      setLoadingSegments(false);
    }
  }, [currentEpisodeId]);

  useEffect(() => {
    if (view === 'segments' && currentEpisodeId) {
      loadSegments();
    }
  }, [view, currentEpisodeId, loadSegments]);

  // 分段视图下若有生成中的段，轮询刷新状态
  // P2-前端2: 轮询 API 传 silent 不自动 toast；连续失败≥3次退避到30s；≥6次暂停并显示"连接中断，点击重试"；状态变化由业务侧主动 showToast
  const hasGeneratingSegments = segmentList.some((s) => s.status === 'generating');
  usePolling({
    enabled: view === 'segments' && !!currentEpisodeId && hasGeneratingSegments,
    retryTick: segPollRetryTick,
    onPaused: () => setSegConnectionLost(true),
    pollFn: async () => {
      if (!currentEpisodeId) return;
      const res = await segmentService.getSegments(currentEpisodeId, { silent: true });
      if (!res.success || !res.data) return; // HTTP 成功但业务失败：不计数，维持正常轮询
      setSegConnectionLost(false);
      const next = res.data;
      // 状态变化（生成中→完成/失败）由业务侧主动提示
      for (const prevSeg of segmentList) {
        const nextSeg = next.find((s) => s.id === prevSeg.id);
        if (!nextSeg) continue;
        if (prevSeg.status === 'generating' && nextSeg.status === 'completed') {
          showToast(`第 ${nextSeg.segment_number} 段视频生成完成`, 'success');
        } else if (prevSeg.status === 'generating' && nextSeg.status === 'failed') {
          showToast(nextSeg.error_message || `第 ${nextSeg.segment_number} 段视频生成失败`, 'error');
        }
      }
      setSegmentList(next);
    },
  });

  // 无生成中的段时清除连接中断提示
  useEffect(() => {
    if (!hasGeneratingSegments) setSegConnectionLost(false);
  }, [hasGeneratingSegments]);

  /** 分段轮询断网暂停后重试：重置失败计数并重启轮询（usePolling 内部会重置计数） */
  const handleSegPollRetry = () => {
    setSegConnectionLost(false);
    setSegPollRetryTick((t) => t + 1);
  };

  // 分段视图需要视频模型配置（生成段视频用）
  useEffect(() => {
    if (view === 'segments' && (!modelConfigs.video || modelConfigs.video.length === 0)) {
      loadModelConfigs();
    }
  }, [view, modelConfigs, loadModelConfigs]);

  /** 解析当前视频模型（记忆优先，缺省第一个已配置） */
  const resolveVideoModel = () => {
    try {
      const stored = localStorage.getItem('moo:last_video_model') || '';
      if (stored) {
        const [provider, modelName] = stored.split(':');
        if (provider && modelName) return { provider, modelName };
      }
    } catch { /* ignore */ }
    const models = modelConfigs.video?.filter((m) => m.is_active) || [];
    if (models.length === 0) return null;
    return { provider: models[0].provider, modelName: models[0].model_name };
  };

  /** 重新聚合分段 */
  const handleAggregate = async () => {
    if (!currentEpisodeId) return;
    setAggregating(true);
    try {
      const res = await segmentService.aggregateSegments(currentEpisodeId);
      if (res.success) {
        setSegmentList(res.data || []);
        showToast('分段已重新聚合', 'success');
      } else {
        showToast(getResponseErrorMessage(res, '重新聚合失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '重新聚合失败');
    } finally {
      setAggregating(false);
    }
  };

  /** 生成段视频 */
  const handleGenerateSegmentVideo = async (segment: Segment) => {
    const model = resolveVideoModel();
    setGeneratingSegmentId(segment.id);
    try {
      const res = await segmentService.generateSegmentVideo(
        segment.id,
        model ? { provider: model.provider, modelName: model.modelName } : {}
      );
      if (res.success && res.data) {
        setSegmentList((prev) => prev.map((s) => (s.id === segment.id ? res.data! : s)));
        showToast(`第 ${segment.segment_number} 段视频生成任务已创建`, 'info');
      } else {
        showToast(getResponseErrorMessage(res, '视频生成失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '视频生成失败');
    } finally {
      setGeneratingSegmentId(null);
    }
  };

  /** 重试段视频 */
  const handleRetrySegment = async (segment: Segment) => {
    setGeneratingSegmentId(segment.id);
    try {
      const res = await segmentService.retrySegment(segment.id);
      if (res.success && res.data) {
        setSegmentList((prev) => prev.map((s) => (s.id === segment.id ? res.data! : s)));
        showToast(`第 ${segment.segment_number} 段已重新提交生成`, 'success');
      } else {
        showToast(getResponseErrorMessage(res, '重试失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '重试失败，请稍后重试');
    } finally {
      setGeneratingSegmentId(null);
    }
  };

  // 切换/初始化剧集
  useEffect(() => {
    if (episodes.length > 0 && !currentEpisodeId) {
      setCurrentEpisode(episodes[0].id);
    }
  }, [episodes, currentEpisodeId, setCurrentEpisode]);

  // 加载当前剧集分镜（P2-前端1: 分镜就绪后一次性批量加载全集关键帧/视频，ShotCard 直接从 store 缓存读取）
  useEffect(() => {
    if (!currentEpisodeId) return;
    let cancelled = false;
    setLoadingShots(true);
    setSelectedShotId(null);
    (async () => {
      await loadShots(currentEpisodeId);
      if (cancelled) return;
      await Promise.all([loadAllKeyframes(currentEpisodeId), loadAllVideos(currentEpisodeId)]);
    })().finally(() => {
      if (!cancelled) setLoadingShots(false);
    });
    return () => { cancelled = true; };
  }, [currentEpisodeId, loadShots, loadAllKeyframes, loadAllVideos]);

  // 监听分镜提示词编辑更新事件，自动刷新分镜列表与媒体缓存
  useEffect(() => {
    const handleShotUpdated = () => {
      if (currentEpisodeId) {
        loadShots(currentEpisodeId);
        loadAllKeyframes(currentEpisodeId);
        loadAllVideos(currentEpisodeId);
      }
    };
    window.addEventListener('shot-updated', handleShotUpdated);
    return () => window.removeEventListener('shot-updated', handleShotUpdated);
  }, [currentEpisodeId, loadShots, loadAllKeyframes, loadAllVideos]);

  // P2-9: 切换视图时重新拉取对应数据——切到镜头视图时刷新分镜列表（首次挂载不重复拉取）
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    if (view === 'shots' && currentEpisodeId) {
      loadShots(currentEpisodeId);
      loadAllKeyframes(currentEpisodeId);
      loadAllVideos(currentEpisodeId);
    }
  }, [view, currentEpisodeId, loadShots, loadAllKeyframes, loadAllVideos]);

  // P2-10: 首帧生成成功后，若当前在分段视图，刷新段状态（segments 依赖镜头分组，需重新拉取）
  useEffect(() => {
    const handleKeyframeGenerated = () => {
      if (view === 'segments' && currentEpisodeId) {
        loadSegments();
      }
    };
    window.addEventListener('shot-keyframe-generated', handleKeyframeGenerated);
    return () => window.removeEventListener('shot-keyframe-generated', handleKeyframeGenerated);
  }, [view, currentEpisodeId, loadSegments]);

  // ── P2-前端5: 一键全自动流水线 ──
  // 挂载时检查是否有正在运行的全自动任务（刷新页面/切回页面时恢复运行态与进度）
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    pipelineService.getCurrentAutoRun(projectId, { silent: true })
      .then((res) => {
        if (cancelled || !res.success || !res.data) return;
        if (res.data.status === 'running') {
          setAutoRunning(true);
          setAutoRunTaskId(res.data.taskId);
          setAutoRunStage(res.data.currentStage);
          setAutoRunStageProgress(res.data.stageProgress || {});
        }
      })
      .catch(() => { /* 静默 */ });
    return () => { cancelled = true; };
  }, [projectId]);

  // 运行态同步到 store（P1-16: ShotCard 据此禁用手动编辑保存）
  useEffect(() => {
    setAutoRunActive(autoRunning);
  }, [autoRunning, setAutoRunActive]);

  /** 启动一键全自动流水线 */
  const handleAutoRun = async () => {
    if (!projectId || autoRunning) return;
    setAutoRunning(true);
    setAutoRunError(null);
    try {
      const res = await pipelineService.autoRun(projectId);
      if (res.success && res.data) {
        setAutoRunTaskId(res.data.taskId);
        showToast('全自动流水线已启动，将在后台逐步完成各阶段', 'info');
      } else {
        setAutoRunning(false);
        showToast(getResponseErrorMessage(res, '启动全自动流水线失败'), 'error');
      }
    } catch (err: unknown) {
      setAutoRunning(false);
      showApiError(showToast, err, '启动全自动流水线失败');
    }
  };

  // 运行中轮询进度；结束后刷新分镜/关键帧/视频/分段
  useEffect(() => {
    if (!autoRunning || !projectId || !autoRunTaskId) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await pipelineService.getAutoRunStatus(projectId, autoRunTaskId, { silent: true });
        if (!res.success || !res.data) return;
        setAutoRunStage(res.data.currentStage);
        setAutoRunStageProgress(res.data.stageProgress || {});
        if (res.data.status !== 'running') {
          setAutoRunning(false);
          if (res.data.status === 'completed') {
            showToast('全自动流水线已完成', 'success');
          } else if (res.data.status === 'failed') {
            setAutoRunError(res.data.error || '全自动流水线执行失败');
            showToast(res.data.error || '全自动流水线执行失败', 'error');
          } else {
            setAutoRunError(`流水线已中断（${res.data.status}）`);
          }
          // 完成后刷新当前剧集数据
          if (currentEpisodeId) {
            loadShots(currentEpisodeId);
            loadAllKeyframes(currentEpisodeId);
            loadAllVideos(currentEpisodeId);
          }
          loadSegments();
        }
      } catch {
        // 静默：下个周期重试
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [autoRunning, projectId, autoRunTaskId, currentEpisodeId, loadShots, loadAllKeyframes, loadAllVideos, loadSegments, showToast]);

  const sortedShots = useMemo(
    () => [...shots].sort((a, b) => a.shot_number - b.shot_number),
    [shots]
  );
  const segments = useMemo(() => groupShotsIntoSegments(sortedShots), [sortedShots]);

  const toggleSegment = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const currentEpisode = episodes.find(e => e.id === currentEpisodeId);
  const hasShots = sortedShots.length > 0;

  // 左栏分段列表数据：镜头视图用逻辑分组，分段视图用后端段列表
  const leftSegments = useMemo(() => {
    if (view === 'segments') {
      return segmentList.map((seg) => ({
        key: `backend-${seg.id}`,
        label: seg.name || `第 ${seg.segment_number} 段`,
        meta: `${seg.duration_seconds}s`,
        status: seg.status as GroupStatus,
        scrollId: `director-seg-backend-${seg.id}`,
      }));
    }
    return segments.map((seg) => ({
      key: seg.key,
      label: seg.label,
      meta: `${seg.shots.length} 镜 · ${seg.totalDuration}s`,
      status: groupStatusOf(seg.shots, videosByShot),
      scrollId: `director-seg-${seg.key}`,
    }));
  }, [view, segments, segmentList, videosByShot]);

  /** 左栏点击分段：高亮 + 展开 + 滚动到对应分组 */
  const handleSelectSegment = (key: string, scrollId: string) => {
    setActiveSegmentKey(key);
    const backendKey = key.startsWith('backend-');
    if (!backendKey) {
      setExpanded((prev) => ({ ...prev, [key.replace('backend-', '')]: true }));
    }
    document.getElementById(scrollId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 整体进度：已完成首帧 / 已完成视频 比例（中栏顶部 4px 进度条）
  const kfDoneCount = sortedShots.filter((s) => (keyframesByShot[s.id] || []).some((k) => k.frame_type === 'first' && k.image_url)).length;
  const videoDoneCount = sortedShots.filter((s) => (videosByShot[s.id] || []).some((v) => v.status === 'completed')).length;
  const totalShots = sortedShots.length;
  const kfPct = totalShots > 0 ? Math.round((kfDoneCount / totalShots) * 100) : 0;
  const videoPct = totalShots > 0 ? Math.round((videoDoneCount / totalShots) * 100) : 0;

  const selectedShot = selectedShotId ? sortedShots.find((s) => s.id === selectedShotId) || null : null;

  const renderScriptPanel = (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setShowScript(!showScript)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--panel-2)]/30 transition-colors"
      >
        <BookOpen className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
        <span className="text-sm font-medium text-[var(--ink-1)]">剧本原文</span>
        <span className="text-xs text-[var(--ink-3)]">
          {currentEpisode?.script_content ? `${currentEpisode.script_content.length} 字` : '无剧本内容'}
        </span>
        <span className="ml-auto text-xs text-[var(--ink-3)]">
          {showScript ? '收起' : '展开'}
        </span>
        {showScript ? (
          <ChevronDown className="w-4 h-4 text-[var(--ink-3)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--ink-3)] flex-shrink-0" />
        )}
      </button>
      {showScript && (
        <div className="px-5 pb-4">
          {currentEpisode?.script_content ? (
            <div className="max-h-96 overflow-y-auto bg-[var(--panel-2)]/50 rounded-lg p-4 text-sm text-[var(--ink-2)] leading-relaxed whitespace-pre-wrap">
              {currentEpisode.script_content}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-3)] py-4 text-center">
              当前剧集暂无剧本内容，请先在「剧本」页生成剧本。
            </p>
          )}
        </div>
      )}
    </Card>
  );

  if (!loadingShots && !hasShots) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <SectionHeader
          icon={<Clapperboard className="w-5 h-5 text-[var(--accent)]" />}
          title="导演台"
          description="段→分镜→首帧→视频，一键导出投产包"
          actions={<EpisodeSelector />}
        />
        {renderScriptPanel}
        <Card>
          <EmptyState
            icon={<Film className="w-12 h-12" />}
            title="还没有分镜"
            description={`${currentEpisode ? `「${currentEpisode.title}」` : '当前剧集'}还没有分镜。导演台需要基于分镜来生成首帧和视频，请先在「剧本」页生成分镜。`}
            action={
              <button
                onClick={() => navigate(`/project/${projectId}/script`)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] text-sm font-medium hover:brightness-110 active:brightness-95 transition-all"
              >
                去生成分镜
                <ArrowRight className="w-4 h-4" />
              </button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      {/* 顶部：标题 + 一键全自动 + 视图切换 */}
      <SectionHeader
        icon={<Clapperboard className="w-5 h-5 text-[var(--accent)]" />}
        title="导演台"
        description="段→分镜→首帧→视频，一键导出投产包"
        actions={
          <>
            {/* P2-前端5: 一键全自动（顶部工具栏，批量操作旁；运行中禁用） */}
            <Button
              size="md"
              leftIcon={autoRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              onClick={handleAutoRun}
              disabled={autoRunning}
            >
              {autoRunning ? '全自动运行中...' : '一键全自动'}
            </Button>
            {/* 视图切换：镜头列表 / 分段 */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--panel-2)] border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setView('shots')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'shots'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                镜头列表
              </button>
              <button
                type="button"
                onClick={() => setView('segments')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'segments'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                分段
              </button>
            </div>
            {view === 'shots' ? (
              <Badge variant="accent">{sortedShots.length} 镜 · {segments.length} 段</Badge>
            ) : (
              <Badge variant="accent">{segmentList.length} 段</Badge>
            )}
          </>
        }
      />

      {/* P2-前端5: 全自动流水线运行进度 */}
      {autoRunning && (
        <Card className="p-3 mb-4 border-l-4 border-l-[var(--accent)]">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Spinner size="sm" />
            <span className="font-medium text-[var(--ink-1)]">全自动流水线运行中</span>
            <span className="text-xs text-[var(--ink-3)]">
              当前阶段：{AUTO_STAGE_LABELS[autoRunStage] || autoRunStage || '准备中'}
            </span>
          </div>
          {Object.keys(autoRunStageProgress).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(autoRunStageProgress).map(([stage, status]) => (
                <Badge
                  key={stage}
                  variant={status === 'done' || status === 'completed' ? 'success' : status === 'failed' ? 'danger' : 'default'}
                >
                  {AUTO_STAGE_LABELS[stage] || stage}：{status === 'done' || status === 'completed' ? '完成' : status === 'failed' ? '失败' : status === 'running' ? '进行中' : status === 'pending' ? '等待' : status}
                </Badge>
              ))}
            </div>
          )}
          {autoRunError && <p className="text-xs text-red-500 mt-2">{autoRunError}</p>}
        </Card>
      )}

      {/* 三栏布局 */}
      <div className="flex items-start gap-4">
        {/* ── 左栏（280px）：剧集切换 + 分段列表 ── */}
        <aside className="w-[280px] flex-shrink-0 hidden lg:block">
          <div className="sticky top-0 space-y-3">
            <EpisodeSelector />
            <Card className="overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-[var(--border)]">
                <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                  {view === 'segments' ? '分段' : '分段列表'}
                </span>
                <span className="ml-1.5 text-[11px] text-[var(--ink-3)]">
                  {view === 'segments' ? segmentList.length : segments.length} 段
                </span>
              </div>
              {leftSegments.length === 0 ? (
                <div className="px-3.5 py-6 text-center text-xs text-[var(--ink-3)]">
                  {view === 'segments' ? '暂无分段，可在中栏点击「重新聚合」' : '暂无分镜'}
                </div>
              ) : (
                <div className="py-1 max-h-[calc(100vh-220px)] overflow-y-auto">
                  {leftSegments.map((item) => {
                    const isActive = activeSegmentKey === item.key;
                    const meta = GROUP_STATUS_META[item.status];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectSegment(item.key, item.scrollId)}
                        className={`w-full flex items-center gap-2 px-3.5 py-2 text-left transition-colors ${
                          isActive ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--panel-2)]'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`}
                          title={meta.label}
                        />
                        <span className={`text-[13px] truncate flex-1 ${isActive ? 'text-[var(--accent)] font-medium' : 'text-[var(--ink-2)]'}`}>
                          {item.label}
                        </span>
                        <span className="text-[11px] text-[var(--ink-3)] flex-shrink-0">{item.meta}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </aside>

        {/* ── 中栏（自适应）：进度条 + 批量操作栏 + 分镜卡片流 ── */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* 整体进度条（4px） */}
          {totalShots > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-[var(--ink-3)] mb-1">
                <span>整体进度</span>
                <span>首帧 {kfDoneCount}/{totalShots} · 视频 {videoDoneCount}/{totalShots}</span>
              </div>
              <div className="w-full h-1 bg-[var(--panel-2)] rounded-full overflow-hidden flex">
                <div className="h-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${kfPct}%` }} />
                <div className="h-full bg-[var(--success)] transition-all duration-500" style={{ width: `${videoPct}%` }} />
              </div>
            </div>
          )}

          {/* 批量操作栏：固定在顶部 */}
          {view === 'shots' && (
            <div className="sticky top-0 z-10 -mx-1 px-1">
              <BatchToolbar onExportPackage={() => setShowExportModal(true)} />
            </div>
          )}

          {renderScriptPanel}

          {/* 段列表（镜头列表视图）：分段头 + 分镜卡片流（间距 12px） */}
          {view === 'shots' && (
            <div className="space-y-2">
              {segments.map((segment) => {
                const isExpanded = expanded[segment.key] !== false; // 默认展开
                const segStatus = groupStatusOf(segment.shots, videosByShot);
                const segMeta = GROUP_STATUS_META[segStatus];
                return (
                  <div key={segment.key} id={`director-seg-${segment.key}`} className="scroll-mt-24">
                    <button
                      type="button"
                      onClick={() => toggleSegment(segment.key)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--panel-2)]/60 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--ink-3)] flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--ink-3)] flex-shrink-0" />
                      )}
                      <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                        {segment.label}
                      </span>
                      {segment.phaseName && <Badge variant="accent" className="text-[11px] px-1.5 py-px">{segment.phaseName}</Badge>}
                      <Badge variant="default" className="text-[11px] px-1.5 py-px">{segment.shots.length} 镜</Badge>
                      <span className="text-xs text-[var(--ink-3)]">{segment.totalDuration}s</span>
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-[11px] text-[var(--ink-3)]">{segMeta.label}</span>
                        <span className={`w-2 h-2 rounded-full ${segMeta.dot}`} />
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="space-y-3">
                        {segment.shots.map((shot, i) => {
                          // 全局镜头序号：当前段之前的镜头数 + 段内序号
                          const globalIndex = sortedShots.findIndex(s => s.id === shot.id);
                          return (
                            <ShotCard
                              key={shot.id}
                              shot={shot}
                              index={globalIndex >= 0 ? globalIndex : i}
                              selected={selectedShotId === shot.id}
                              onSelect={(s) => setSelectedShotId(s.id)}
                              showToast={showToast}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 分段视图（按 Segment 数据分组，支持视频生成/重试） */}
          {view === 'segments' && (
            <div className="space-y-4">
              {/* P2-前端2: 分段轮询断网暂停提示 */}
              {segConnectionLost && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-500">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  连接中断，分段状态暂停轮询
                  <button
                    type="button"
                    onClick={handleSegPollRetry}
                    className="ml-auto px-2 py-0.5 rounded border border-red-500/30 hover:bg-red-500/10 transition-colors"
                  >
                    点击重试
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--ink-3)]">
                  每段 8-15 秒 · 由 2-4 个镜头聚合而成，独立生成视频，可单独重试
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  onClick={handleAggregate}
                  isLoading={aggregating}
                >
                  重新聚合
                </Button>
              </div>

              {loadingSegments ? (
                <div className="flex items-center justify-center py-16 text-[var(--ink-3)]">
                  <Spinner className="mr-2" /> 加载分段...
                </div>
              ) : segmentList.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<LayoutGrid className="w-10 h-10" />}
                    title="暂无分段"
                    description="点击「重新聚合」按每段≤15秒的规则合并镜头生成分段"
                  />
                </Card>
              ) : (
                segmentList.map((segment) => {
                  const isGenerating = generatingSegmentId === segment.id;
                  const canRetry = segment.status === 'failed';
                  const canGenerate = segment.status === 'pending' || segment.status === 'completed';
                  const showVideo = segment.status === 'completed' && !!segment.video_url;
                  return (
                    <div key={segment.id} id={`director-seg-backend-${segment.id}`} className="scroll-mt-24">
                      <Card className="overflow-hidden group">
                      <div className="px-5 py-4">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <span className="text-base font-semibold text-[var(--ink-1)] font-[var(--font-display)]">
                            {segment.name || `第 ${segment.segment_number} 段`}
                          </span>
                          <Badge variant={SEGMENT_STATUS_VARIANTS[segment.status]}>
                            {segment.status === 'generating' && <Spinner className="w-3 h-3 mr-1" />}
                            {SEGMENT_STATUS_LABELS[segment.status]}
                          </Badge>
                          <span className="text-xs text-[var(--ink-3)]">{segment.duration_seconds}s</span>
                          {segment.start_shot_number != null && segment.end_shot_number != null && (
                            <span className="text-xs text-[var(--ink-3)]">
                              镜头 {segment.start_shot_number}-{segment.end_shot_number}
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-2">
                            {segment.status === 'generating' ? (
                              <span className="text-xs text-[var(--ink-3)] flex items-center gap-1">
                                <Spinner className="w-3 h-3" /> 视频生成中...
                                {/* P2-前端6: generating 状态也可重置并重试（后端 retry 会先清理 generating 再重新提交） */}
                                <button
                                  type="button"
                                  onClick={() => handleRetrySegment(segment)}
                                  disabled={isGenerating}
                                  className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] border border-[var(--border)] text-[var(--ink-3)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-colors opacity-0 group-hover:opacity-100"
                                  title="重置并重试"
                                >
                                  重置并重试
                                </button>
                              </span>
                            ) : canGenerate ? (
                              <Button
                                size="sm"
                                variant="outline"
                                leftIcon={<Video className="w-3.5 h-3.5" />}
                                onClick={() => handleGenerateSegmentVideo(segment)}
                                isLoading={isGenerating}
                              >
                                生成视频
                              </Button>
                            ) : canRetry ? (
                              <Button
                                size="sm"
                                variant="danger"
                                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                                onClick={() => handleRetrySegment(segment)}
                                isLoading={isGenerating}
                              >
                                重试
                              </Button>
                            ) : null}
                          </span>
                        </div>

                        {segment.status === 'failed' && segment.error_message && (
                          <p className="text-xs text-[var(--term-red)] flex items-center gap-1 mb-2">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            {segment.error_message}
                          </p>
                        )}

                        {showVideo && (
                          <div className="rounded-lg overflow-hidden border border-[var(--border)] bg-black/60">
                            <video
                              src={segment.video_url!}
                              controls
                              playsInline
                              preload="metadata"
                              className="w-full max-h-[320px]"
                            />
                          </div>
                        )}
                      </div>
                      </Card>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── 右栏（320px）：选中镜头详情/操作面板 ── */}
        {isXl ? (
          <aside className="w-[320px] flex-shrink-0 hidden xl:block">
            <div className="sticky top-0">
              <Card className="p-4 max-h-[calc(100vh-140px)] overflow-y-auto">
                {selectedShot ? (
                  <ShotDetailPanel
                    shot={selectedShot}
                    index={sortedShots.findIndex((s) => s.id === selectedShot.id)}
                    showToast={showToast}
                    onDeleted={() => {
                      setSelectedShotId(null);
                      if (currentEpisodeId) loadShots(currentEpisodeId);
                    }}
                    onClose={() => setSelectedShotId(null)}
                  />
                ) : (
                  <div className="py-8">
                    <EmptyState
                      icon={<MousePointerClick className="w-8 h-8" />}
                      title="选择一个分镜查看详情"
                      description="点击中栏分镜卡片，在右侧编辑提示词、角色调度并生成首帧/视频"
                    />
                  </div>
                )}
              </Card>
            </div>
          </aside>
        ) : (
          /* 小屏回退：详情以弹窗呈现，保证编辑/生成功能不丢失 */
          <Modal
            open={!!selectedShot}
            onOpenChange={(o) => { if (!o) setSelectedShotId(null); }}
            title={selectedShot ? `第 ${sortedShots.findIndex((s) => s.id === selectedShot.id) + 1} 镜 · 详情` : ''}
            size="md"
          >
            {selectedShot && (
              <ShotDetailPanel
                shot={selectedShot}
                index={sortedShots.findIndex((s) => s.id === selectedShot.id)}
                showToast={showToast}
                onDeleted={() => {
                  setSelectedShotId(null);
                  if (currentEpisodeId) loadShots(currentEpisodeId);
                }}
                onClose={() => setSelectedShotId(null)}
              />
            )}
          </Modal>
        )}
      </div>

      {/* 导出投产包弹窗（合并原 StageExport：投产包 + 视频合成 + 字幕 + 文档导出） */}
      <ExportPackageModal open={showExportModal} onOpenChange={setShowExportModal} />
    </div>
  );
}
