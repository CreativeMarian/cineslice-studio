// 第 5 段 · 导演台：段 → 分镜 → 首帧 → 视频，一键导出投产包
// 结构：SectionHeader + EpisodeSelector + 批量操作栏（BatchToolbar）+ 段列表（可展开/收起）+ 导出投产包弹窗（ExportPackageModal）
// 分镜按段分组：优先 segment_id（后端段概念，与导出服务一致），其次 phase（剧情阶段），最后按累计 ≤15 秒兜底
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { Clapperboard, Film, ChevronDown, ChevronRight, ArrowRight, BookOpen } from 'lucide-react';
import { Card, EmptyState, Badge } from '../ui';
import { SectionHeader } from '../common/SectionHeader';
import { EpisodeSelector } from '../common/EpisodeSelector';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { BatchToolbar } from './BatchToolbar';
import { ShotCard } from './ShotCard';
import { ExportPackageModal } from './ExportPackageModal';
import type { Shot } from '../../types';

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

export function StageDirectorPage() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { shots, currentEpisodeId, episodes, setCurrentEpisode, loadShots } = useProjectStore();
  const { showToast } = useUIStore();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingShots, setLoadingShots] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showScript, setShowScript] = useState(false);

  // 切换/初始化剧集
  useEffect(() => {
    if (episodes.length > 0 && !currentEpisodeId) {
      setCurrentEpisode(episodes[0].id);
    }
  }, [episodes, currentEpisodeId, setCurrentEpisode]);

  // 加载当前剧集分镜
  useEffect(() => {
    if (!currentEpisodeId) return;
    let cancelled = false;
    setLoadingShots(true);
    loadShots(currentEpisodeId).finally(() => {
      if (!cancelled) setLoadingShots(false);
    });
    return () => { cancelled = true; };
  }, [currentEpisodeId, loadShots]);

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

  if (!loadingShots && !hasShots) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <SectionHeader
          icon={<Clapperboard className="w-5 h-5 text-[var(--accent)]" />}
          title="导演台"
          description="段→分镜→首帧→视频，一键导出投产包"
          actions={<EpisodeSelector />}
        />

        {/* 剧本面板：可折叠，显示当前集完整剧本 */}
        <Card className="mb-4 overflow-hidden">
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

        <Card>
          <EmptyState
            icon={<Film className="w-12 h-12" />}
            title="还没有分镜"
            description={`${currentEpisode ? `「${currentEpisode.title}」` : '当前剧集'}还没有分镜。导演台需要基于分镜来生成首帧和视频，请先在「剧本」页生成分镜。`}
            action={
              <button
                onClick={() => navigate(`/project/${projectId}/script`)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-[var(--on-accent)] text-sm font-medium hover:brightness-110 active:brightness-95 transition-all shadow-[0_2px_8px_rgba(249,115,22,0.3)]"
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
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* 顶部：标题 + 剧集选择 */}
      <SectionHeader
        icon={<Clapperboard className="w-5 h-5 text-[var(--accent)]" />}
        title="导演台"
        description="段→分镜→首帧→视频，一键导出投产包"
        actions={
          <>
            <Badge variant="accent">{sortedShots.length} 镜 · {segments.length} 段</Badge>
            <EpisodeSelector />
          </>
        }
      />

      {/* 批量操作栏：批量生成首帧 / 批量生成视频 / 导出投产包 */}
      <BatchToolbar onExportPackage={() => setShowExportModal(true)} />

      {/* 剧本面板：可折叠，显示当前集完整剧本，方便对照分镜 */}
      <Card className="mb-4 overflow-hidden">
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

      {/* 段列表 */}
      <div className="space-y-4">
        {segments.map((segment) => {
          const isExpanded = expanded[segment.key] !== false; // 默认展开
          return (
            <Card key={segment.key} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSegment(segment.key)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[var(--panel-2)]/30 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-[var(--ink-3)] flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[var(--ink-3)] flex-shrink-0" />
                )}
                <span className="text-base font-semibold text-[var(--ink-1)] font-[var(--font-display)]">
                  {segment.label}
                </span>
                {segment.phaseName && <Badge variant="accent">{segment.phaseName}</Badge>}
                <Badge variant="default">{segment.shots.length} 镜</Badge>
                <span className="text-xs text-[var(--ink-3)]">{segment.totalDuration}s</span>
                <span className="ml-auto text-xs text-[var(--ink-3)]">
                  {isExpanded ? '收起' : '展开'}
                </span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {segment.shots.map((shot, i) => {
                    // 全局镜头序号：当前段之前的镜头数 + 段内序号
                    const globalIndex = sortedShots.findIndex(s => s.id === shot.id);
                    return (
                      <ShotCard
                        key={shot.id}
                        shot={shot}
                        index={globalIndex >= 0 ? globalIndex : i}
                        showToast={showToast}
                        onDeleted={() => currentEpisodeId && loadShots(currentEpisodeId)}
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* 导出投产包弹窗（合并原 StageExport：投产包 + 视频合成 + 字幕 + 文档导出） */}
      <ExportPackageModal open={showExportModal} onOpenChange={setShowExportModal} />
    </div>
  );
}
