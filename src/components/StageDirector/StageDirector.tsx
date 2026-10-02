// 导演工作台编排器：剧集初始化 + 头部 + 批量工具栏 + 流程引导 + 视频音频标签页
// 拆分结构：BatchToolbar（批量生成）/ ShotCard（单镜头卡片）/ VideoParamsPanel（参数表单）/ AudioPanel（音频合成）
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clapperboard, Video, Music, Film, ArrowRight } from 'lucide-react';
import { Card, EmptyState, Badge, Tabs } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { sceneService } from '../../services/assetService';
import { AudioPanel } from './AudioPanel';
import { BatchToolbar } from './BatchToolbar';
import { ShotCard } from './ShotCard';
import apiClient from '../../services/apiClient';

interface ShotReadiness {
  shotId: string;
  shotNumber: number;
  status: 'ready' | 'missing_ref' | 'need_previous' | 'stale' | 'no_keyframe';
  issues: string[];
  hasFirstFrame: boolean;
  hasLastFrame: boolean;
  hasCharacterRefs: boolean;
  hasSceneRef: boolean;
  hasVideo: boolean;
  previousShotHasVideo: boolean;
}

export function StageDirector() {
  const { shots, currentEpisodeId, episodes, setCurrentEpisode, loadShots } = useProjectStore();
  const { showToast } = useUIStore();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [expandedShot, setExpandedShot] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [sceneMap, setSceneMap] = useState<Record<string, string>>({}); // scene_id → scene_name
  const [readinessMap, setReadinessMap] = useState<Record<string, ShotReadiness>>({}); // P1-2: 镜头就绪状态

  // 加载镜头就绪状态
  useEffect(() => {
    if (!currentEpisodeId || shots.length === 0) return;
    apiClient.get<unknown, { success?: boolean; data?: ShotReadiness[] }>(`/episodes/${currentEpisodeId}/shots/readiness`)
      .then((res) => {
        if (res.success && res.data) {
          const map: Record<string, ShotReadiness> = {};
          for (const r of res.data) map[r.shotId] = r;
          setReadinessMap(map);
        }
      })
      .catch(() => { /* 就绪状态加载失败时静默 */ });
  }, [currentEpisodeId, shots.length]);

  useEffect(() => {
    if (episodes.length > 0 && !currentEpisodeId) {
      const firstEp = episodes[0];
      setCurrentEpisode(firstEp.id);
      loadShots(firstEp.id);
    } else if (currentEpisodeId && shots.length === 0) {
      loadShots(currentEpisodeId);
    }
  }, [episodes, currentEpisodeId, shots.length, setCurrentEpisode, loadShots]);

  // 加载场景清单：分镜生成后镜头已关联 scene_id，此处用于展示"镜头所属场景"
  useEffect(() => {
    if (!currentEpisodeId) return;
    sceneService.list(currentEpisodeId).then((res) => {
      if (res.success && res.data) {
        const map: Record<string, string> = {};
        for (const s of res.data) if (s.id) map[s.id] = s.name;
        setSceneMap(map);
      }
    }).catch(() => { /* 场景未提取时静默 */ });
  }, [currentEpisodeId]);

  const currentEpisode = episodes.find(e => e.id === currentEpisodeId);
  const hasShots = shots.length > 0;

  if (!hasShots) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Clapperboard className="w-6 h-6 text-[var(--accent)]" />
          <h2 className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">导演工作台</h2>
        </div>
        <Card>
          <EmptyState
            icon={<Film className="w-12 h-12" />}
            title="还没有分镜"
            description="导演工作台需要基于分镜来生成关键帧和视频。请先在「剧本」页面的「分镜表」标签页生成分镜。"
          />
          <div className="flex justify-center pb-6">
            <button
              onClick={() => navigate(`/projects/${projectId}/script?tab=shots`)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] text-[var(--on-accent)] text-sm font-medium hover:brightness-110 active:brightness-95 transition-all shadow-[0_2px_8px_rgba(249,115,22,0.3)]"
            >
              去生成分镜
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
            <Clapperboard className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">导演工作台</h2>
            <p className="text-sm text-[var(--ink-3)]">
              {currentEpisode?.title || '当前剧集'} · {shots.length} 个镜头
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="accent">{shots.length} 镜</Badge>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      <BatchToolbar />

      {/* 流程引导 */}
      <div className="flex items-center gap-2 mb-4 text-xs text-[var(--ink-3)] flex-wrap">
        <span className="px-2 py-1 rounded bg-green-500/10 text-green-600 dark:text-green-400">✓ 剧本</span>
        <span>→</span>
        <span className="px-2 py-1 rounded bg-green-500/10 text-green-600 dark:text-green-400">✓ 分镜</span>
        <span>→</span>
        <span className="px-2 py-1 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-medium">音频合成</span>
        <span>→</span>
        <span className="px-2 py-1 rounded bg-[var(--panel-2)]">视频生成</span>
        <span>→</span>
        <span className="px-2 py-1 rounded bg-[var(--panel-2)]">最终合成</span>
      </div>

      <Tabs defaultValue="video" value={activeTab} onValueChange={(v) => setActiveTab(v as 'video' | 'audio')}>
        <Tabs.List>
          <Tabs.Trigger value="video">
            <Video className="w-4 h-4 mr-1.5" /> 视频生成
          </Tabs.Trigger>
          <Tabs.Trigger value="audio">
            <Music className="w-4 h-4 mr-1.5" /> 音频合成
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="video">
          <div className="space-y-3 mt-4">
            {shots.map((shot, index) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={index}
                sceneName={shot.scene_id ? sceneMap[shot.scene_id] : undefined}
                isExpanded={expandedShot === shot.id}
                onToggle={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
                showToast={showToast}
                readiness={readinessMap[shot.id]}
              />
            ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="audio">
          <AudioPanel episodeId={currentEpisodeId!} shots={shots} showToast={showToast} />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
