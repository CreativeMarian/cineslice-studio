// 导演工作台编排器：剧集初始化 + 头部 + 批量工具栏 + 流程引导 + 视频音频标签页
// 拆分结构：BatchToolbar（批量生成）/ ShotCard（单镜头卡片）/ VideoParamsPanel（参数表单）/ AudioPanel（音频合成）
import { useState, useEffect } from 'react';
import { Clapperboard, Video, Music, Film } from 'lucide-react';
import { Card, EmptyState, Badge, Tabs } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { AudioPanel } from './AudioPanel';
import { BatchToolbar } from './BatchToolbar';
import { ShotCard } from './ShotCard';

export function StageDirector() {
  const { shots, currentEpisodeId, episodes, setCurrentEpisode, loadShots } = useProjectStore();
  const { showToast } = useUIStore();
  const [expandedShot, setExpandedShot] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');

  useEffect(() => {
    if (episodes.length > 0 && !currentEpisodeId) {
      const firstEp = episodes[0];
      setCurrentEpisode(firstEp.id);
      loadShots(firstEp.id);
    } else if (currentEpisodeId && shots.length === 0) {
      loadShots(currentEpisodeId);
    }
  }, [episodes, currentEpisodeId, shots.length, setCurrentEpisode, loadShots]);

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
            description="请先在「分镜表」阶段生成分镜，然后回到导演工作台生成关键帧和视频"
          />
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
        <span className="px-2 py-1 rounded bg-green-500/10 text-green-600">✓ 剧本</span>
        <span>→</span>
        <span className="px-2 py-1 rounded bg-green-500/10 text-green-600">✓ 分镜</span>
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
                isExpanded={expandedShot === shot.id}
                onToggle={() => setExpandedShot(expandedShot === shot.id ? null : shot.id)}
                showToast={showToast}
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
