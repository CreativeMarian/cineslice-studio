// 批量生成工具栏：模型选择 + 一键批量生成首帧/视频 + 批量删除（自含批量逻辑与进度状态）
import { useEffect, useState } from 'react';
import { Video, Image, Zap, Layers, Trash2 } from 'lucide-react';
import { Card, Button, Modal } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { useModelStore } from '../../stores/useModelStore';
import { useUIStore } from '../../stores/useUIStore';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import { videoService } from '../../services/videoService';
import { shotService } from '../../services/shotService';
import { useStoredModelKey } from './useStoredModelKey';
import apiClient from '../../services/apiClient';

// 解析项目配置的单镜时长（用户在项目配置栏可设 5-60 秒；与后端 shots.ts 的 project?.default_shot_duration || 5 同款读取）
async function resolveProjectShotDuration(
  currentProject: { default_shot_duration?: number } | null,
  episodeProjectId?: string
): Promise<number> {
  const fromProject = currentProject?.default_shot_duration;
  if (fromProject && fromProject >= 5 && fromProject <= 60) return fromProject;
  if (episodeProjectId) {
    try {
      const res = await apiClient.get<unknown, { success?: boolean; data?: { default_shot_duration?: number } }>(
        `/projects/${episodeProjectId}`
      );
      const d = res.data?.default_shot_duration;
      if (d && d >= 5 && d <= 60) return d;
    } catch {
      // 项目查询失败时使用默认值
    }
  }
  return 5;
}

// 查询已有首帧的镜头 ID（frame_type=first 且有图）：批量生成前跳过，避免对已存在首帧重复生成消耗额度
async function fetchShotsWithFirstFrame(shots: { id: string }[]): Promise<Set<string>> {
  const existing = new Set<string>();
  const CHUNK_SIZE = 8; // 分批并发查询，避免一次性 N 个请求压垮后端
  for (let i = 0; i < shots.length; i += CHUNK_SIZE) {
    const chunk = shots.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (s) => {
        try {
          const res = await videoService.getKeyframes(s.id);
          if (res.success && res.data?.some(k => k.frame_type === 'first' && k.image_url)) return s.id;
        } catch {
          // 单个查询失败视为无首帧，继续走生成
        }
        return null;
      })
    );
    for (const id of results) if (id) existing.add(id);
  }
  return existing;
}

export function BatchToolbar() {
  const { shots, currentEpisodeId, loadShots, currentProject, episodes } = useProjectStore();
  const { showToast } = useUIStore();
  const { configs, loadConfigs } = useModelStore();
  const [isBatchGeneratingKeyframes, setIsBatchGeneratingKeyframes] = useState(false);
  const [isBatchGeneratingVideos, setIsBatchGeneratingVideos] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  // 批量生成使用的模型（记忆用户上次选择）
  const [batchImageModel, setBatchImageModel] = useStoredModelKey('moo:last_image_model');
  const [batchVideoModel, setBatchVideoModel] = useStoredModelKey('moo:last_video_model');

  // 批量删除
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleBatchDelete = async () => {
    if (!currentEpisodeId) return;
    setShowDeleteConfirm(false);
    setIsBatchDeleting(true);
    try {
      let success = 0;
      let failed = 0;
      for (const shot of shots) {
        try {
          const res = await shotService.delete(shot.id);
          if (res.success) success += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) {
        showToast(`批量删除：成功${success}个，失败${failed}个`, 'warning');
      } else {
        showToast(`已删除 ${success} 个镜头`, 'success');
      }
      loadShots(currentEpisodeId);
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // 加载模型配置
  useEffect(() => {
    if (!configs.image || configs.image.length === 0) {
      loadConfigs();
    }
  }, [configs, loadConfigs]);

  // 批量生成首帧关键帧
  const handleBatchGenerateKeyframes = async () => {
    if (!currentEpisodeId) return;
    const imgModels = configs.image?.filter(m => m.is_active) || [];
    if (imgModels.length === 0) {
      showToast('请先配置图像模型', 'error');
      return;
    }
    // 优先使用用户记忆的模型，否则用第一个已配置模型
    let provider: string, modelName: string;
    if (batchImageModel) {
      [provider, modelName] = batchImageModel.split(':');
    } else {
      [provider, modelName] = [imgModels[0].provider, imgModels[0].model_name];
    }
    setIsBatchGeneratingKeyframes(true);
    try {
      // 批量跳过已有首帧的镜头：后端 batch 对已有首帧是"先生成新帧、成功后再删旧帧"，
      // 重复点击会对已存在首帧重新生成并消耗额度——前端先查询并过滤，只对缺首帧的镜头发起批量
      const existingFirstFrameIds = await fetchShotsWithFirstFrame(shots);
      const pendingShots = shots.filter(s => !existingFirstFrameIds.has(s.id));
      const skippedCount = existingFirstFrameIds.size;
      if (pendingShots.length === 0) {
        showToast(`全部 ${shots.length} 个镜头已有首帧，无需重新生成`, 'info');
        return;
      }
      setBatchProgress({ current: 0, total: pendingShots.length });
      const res = await videoService.batchGenerateKeyframesStream(currentEpisodeId, {
        provider, modelName,
        shotIds: pendingShots.map(s => s.id),
      }, (p) => {
        // 实时进度：后端逐镜推送，不做任何模拟
        setBatchProgress({ current: Math.min(p.index, pendingShots.length), total: pendingShots.length });
      });
      if (res.success && res.data) {
        const { success, failed, results } = res.data;
        const skipNote = skippedCount > 0 ? `，跳过${skippedCount}个已存在` : '';
        if (failed > 0) {
          // 显示具体错误信息
          const errorDetails = results
            .filter((r: any) => !r.success)
            .map((r: any) => `镜头${r.shotId?.slice(-6) || ''}: ${r.error || '未知错误'}`)
            .join('; ');
          showToast(`批量生成：成功${success}个，失败${failed}个${skipNote}。${errorDetails}`, 'error');
        } else {
          showToast(`批量生成完成：成功${success}个${skipNote}`, 'success');
        }
        // 刷新所有镜头数据
        loadShots(currentEpisodeId);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '批量生成关键帧失败';
      showToast(errorMsg, 'error');
      console.error('[BatchKeyframe] 批量生成失败:', err);
    } finally {
      setIsBatchGeneratingKeyframes(false);
      setBatchProgress(null);
    }
  };

  // 批量生成视频
  const handleBatchGenerateVideos = async () => {
    if (!currentEpisodeId) return;
    const vidModels = configs.video?.filter(m => m.is_active) || [];
    if (vidModels.length === 0) {
      showToast('请先配置视频模型', 'error');
      return;
    }
    // 优先使用用户记忆的模型，否则用第一个已配置模型
    let provider: string, modelName: string;
    if (batchVideoModel) {
      [provider, modelName] = batchVideoModel.split(':');
    } else {
      [provider, modelName] = [vidModels[0].provider, vidModels[0].model_name];
    }
    setIsBatchGeneratingVideos(true);
    setBatchProgress({ current: 0, total: shots.length });
    try {
      // 读取项目配置的单镜时长（用户 5-60 秒配置；与后端 shots.ts 读取逻辑一致，不再硬编码 5 秒）
      const episode = episodes.find(e => e.id === currentEpisodeId);
      const shotDuration = await resolveProjectShotDuration(currentProject, episode?.project_id);
      const res = await videoService.batchGenerateVideosStream(currentEpisodeId, {
        provider, modelName,
        duration: shotDuration,
        ratio: '16:9',
        resolution: '1080p',
      }, (p) => {
        // 实时进度：后端逐镜推送，不做任何模拟
        setBatchProgress({ current: Math.min(p.index, shots.length), total: shots.length });
      });
      if (res.success && res.data) {
        const skippedShots = res.data.skippedShots || [];
        if (skippedShots.length > 0) {
          const reasons = skippedShots.map((s: any) => `镜头${s.shotId?.slice(-6) || ''}: ${s.reason}`).join('; ');
          showToast(`批量视频：成功${res.data.created}个，跳过${res.data.skipped}个（${reasons}）`, 'warning', { duration: 8000 });
        } else {
          showToast(`批量视频任务已创建：${res.data.created}个成功`, 'success');
        }
        loadShots(currentEpisodeId);
      }
    } catch {
      showToast('批量生成视频失败', 'error');
    } finally {
      setIsBatchGeneratingVideos(false);
      setBatchProgress(null);
    }
  };

  return (
    <Card className="p-4 mb-4 border-l-4 border-l-[var(--accent)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-medium text-[var(--ink-1)]">一键批量生成</span>
          <span className="text-xs text-[var(--ink-3)]">选择模型后一键生成全部镜头</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 批量首帧模型选择 */}
          <div className="flex items-center gap-1.5">
            <Image className="w-3.5 h-3.5 text-[var(--ink-3)]" />
            <div className="w-72">
              <ModelSelector
                modelType="image"
                value={batchImageModel}
                onChange={setBatchImageModel}
                placeholder="首帧模型"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Layers className="w-4 h-4" />}
            onClick={handleBatchGenerateKeyframes}
            isLoading={isBatchGeneratingKeyframes}
            disabled={isBatchGeneratingVideos || !batchImageModel}
          >
            一键生成全部首帧
          </Button>
          {/* 批量视频模型选择 */}
          <div className="flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-[var(--ink-3)]" />
            <div className="w-72">
              <ModelSelector
                modelType="video"
                value={batchVideoModel}
                onChange={setBatchVideoModel}
                placeholder="视频模型"
              />
            </div>
          </div>
          <Button
            size="sm"
            leftIcon={<Video className="w-4 h-4" />}
            onClick={handleBatchGenerateVideos}
            isLoading={isBatchGeneratingVideos}
            disabled={isBatchGeneratingKeyframes || !batchVideoModel}
          >
            一键生成全部视频
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Trash2 className="w-4 h-4" />}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isBatchGeneratingKeyframes || isBatchGeneratingVideos || shots.length === 0}
          >
            批量删除
          </Button>
        </div>
      </div>
      {batchProgress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-[var(--ink-3)] mb-1">
            <span>批量处理中（实时进度）...</span>
            <span>{batchProgress.current}/{batchProgress.total} 镜</span>
          </div>
          <div className="w-full h-1.5 bg-[var(--panel-3)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-300"
              style={{ width: batchProgress.total > 0 ? `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* 批量删除确认 Modal */}
      <Modal
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="批量删除镜头"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--ink-2)]">
            确定要删除当前剧集的全部 {shots.length} 个镜头吗？此操作会同时删除关联的首帧、视频与音频，且不可恢复。
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              取消
            </Button>
            <Button size="sm" variant="danger" onClick={handleBatchDelete} isLoading={isBatchDeleting}>
              确认删除
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
