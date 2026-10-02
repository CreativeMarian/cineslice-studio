// 批量生成工具栏：模型选择 + 一键批量生成首帧/视频（自含批量逻辑与进度状态）
import { useEffect, useState } from 'react';
import { Video, Image, Zap, Layers, ShieldCheck } from 'lucide-react';
import { Card, Button, Modal, Badge } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { useModelStore } from '../../stores/useModelStore';
import { useUIStore } from '../../stores/useUIStore';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import { videoService } from '../../services/videoService';
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

  // P1-1: 一致性检查报告
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [consistencyReport, setConsistencyReport] = useState<any>(null);
  const [showConsistencyModal, setShowConsistencyModal] = useState(false);

  const handleCheckConsistency = async () => {
    if (!currentEpisodeId) return;
    setIsCheckingConsistency(true);
    try {
      const res = await apiClient.get<unknown, { success?: boolean; data?: any }>(`/episodes/${currentEpisodeId}/consistency-report`);
      if (res.success && res.data) {
        setConsistencyReport(res.data);
        setShowConsistencyModal(true);
        if (res.data.checkedShots > 0) {
          showToast(`一致性检查完成：平均分 ${res.data.averageScore}，通过 ${res.data.passedShots}/${res.data.checkedShots}`, res.data.failedShots > 0 ? 'warning' : 'success');
        } else {
          showToast('暂无已完成视频可检查，请先生成视频', 'info');
        }
      } else {
        showToast('一致性检查失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '一致性检查失败', 'error');
    } finally {
      setIsCheckingConsistency(false);
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
            leftIcon={<ShieldCheck className="w-4 h-4" />}
            onClick={handleCheckConsistency}
            isLoading={isCheckingConsistency}
          >
            一致性检查
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

      {/* P1-1: 一致性检查报告 Modal */}
      <Modal
        open={showConsistencyModal}
        onOpenChange={setShowConsistencyModal}
        title="一致性检查报告"
      >
        {consistencyReport && (
          <div className="space-y-4">
            {/* 总览统计 */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                <p className="text-2xl font-bold text-[var(--accent)]">{consistencyReport.totalShots}</p>
                <p className="text-xs text-[var(--ink-3)]">总镜头数</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                <p className="text-2xl font-bold text-blue-500">{consistencyReport.checkedShots}</p>
                <p className="text-xs text-[var(--ink-3)]">已检查</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                <p className="text-2xl font-bold text-green-500">{consistencyReport.passedShots}</p>
                <p className="text-xs text-[var(--ink-3)]">通过</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-[var(--panel-2)]">
                <p className={`text-2xl font-bold ${consistencyReport.averageScore >= 80 ? 'text-green-500' : consistencyReport.averageScore >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                  {consistencyReport.averageScore}
                </p>
                <p className="text-xs text-[var(--ink-3)]">平均分</p>
              </div>
            </div>

            {/* 评分进度条 */}
            <div>
              <div className="flex items-center justify-between text-xs text-[var(--ink-3)] mb-1">
                <span>整体一致性评分</span>
                <span>{consistencyReport.averageScore}/100</span>
              </div>
              <div className="w-full h-2 bg-[var(--panel-3)] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${consistencyReport.averageScore >= 80 ? 'bg-green-500' : consistencyReport.averageScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${consistencyReport.averageScore}%` }}
                />
              </div>
            </div>

            {/* 失败镜头详情 */}
            {consistencyReport.details?.filter((d: any) => !d.passed).length > 0 && (
              <div>
                <p className="text-sm font-medium text-[var(--ink-1)] mb-2 flex items-center gap-2">
                  <Badge variant="danger">{consistencyReport.details.filter((d: any) => !d.passed).length} 个镜头需优化</Badge>
                </p>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {consistencyReport.details.filter((d: any) => !d.passed).map((d: any) => (
                    <div key={d.shotId} className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-[var(--ink-1)]">第 {d.shotNumber} 镜</span>
                        <Badge variant="danger">{d.score}分</Badge>
                      </div>
                      {d.issues?.length > 0 && (
                        <ul className="text-xs text-[var(--ink-2)] space-y-0.5">
                          {d.issues.map((issue: string, i: number) => (
                            <li key={i}>• {issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 全部通过 */}
            {consistencyReport.details?.filter((d: any) => !d.passed).length === 0 && consistencyReport.checkedShots > 0 && (
              <div className="text-center py-6">
                <ShieldCheck className="w-12 h-12 mx-auto text-green-500 mb-2" />
                <p className="text-sm font-medium text-green-600 dark:text-green-400">所有镜头一致性检查通过！</p>
                <p className="text-xs text-[var(--ink-3)] mt-1">角色、场景、风格保持一致</p>
              </div>
            )}

            {consistencyReport.checkedShots === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-[var(--ink-3)]">暂无已完成视频可检查</p>
                <p className="text-xs text-[var(--ink-3)] mt-1">请先生成视频后再进行一致性检查</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
