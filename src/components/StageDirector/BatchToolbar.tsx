// 批量生成工具栏：模型选择 + 一键批量生成首帧/视频（自含批量逻辑与进度状态）
import { useEffect, useState } from 'react';
import { Video, Image, Zap, Layers } from 'lucide-react';
import { Card, Button } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { useModelStore } from '../../stores/useModelStore';
import { useUIStore } from '../../stores/useUIStore';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import { videoService } from '../../services/videoService';
import { useStoredModelKey } from './useStoredModelKey';

export function BatchToolbar() {
  const { shots, currentEpisodeId, loadShots } = useProjectStore();
  const { showToast } = useUIStore();
  const { configs, loadConfigs } = useModelStore();
  const [isBatchGeneratingKeyframes, setIsBatchGeneratingKeyframes] = useState(false);
  const [isBatchGeneratingVideos, setIsBatchGeneratingVideos] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  // 批量生成使用的模型（记忆用户上次选择）
  const [batchImageModel, setBatchImageModel] = useStoredModelKey('moo:last_image_model');
  const [batchVideoModel, setBatchVideoModel] = useStoredModelKey('moo:last_video_model');

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
    setBatchProgress({ current: 0, total: shots.length });
    try {
      const res = await videoService.batchGenerateKeyframesStream(currentEpisodeId, { provider, modelName }, (p) => {
        // 实时进度：后端逐镜推送，不做任何模拟
        setBatchProgress({ current: Math.min(p.index, shots.length), total: shots.length });
      });
      if (res.success && res.data) {
        const { success, failed, results } = res.data;
        if (failed > 0) {
          // 显示具体错误信息
          const errorDetails = results
            .filter((r: any) => !r.success)
            .map((r: any) => `镜头${r.shotId?.slice(-6) || ''}: ${r.error || '未知错误'}`)
            .join('; ');
          showToast(`批量生成：成功${success}个，失败${failed}个。${errorDetails}`, 'error');
        } else {
          showToast(`批量生成完成：成功${success}个`, 'success');
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
      const res = await videoService.batchGenerateVideosStream(currentEpisodeId, {
        provider, modelName,
        duration: 5,
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
    </Card>
  );
}
