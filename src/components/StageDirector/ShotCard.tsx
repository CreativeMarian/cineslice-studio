// 单镜头卡片：折叠摘要行 + 展开后的关键帧/视频生成面板（自含数据加载与轮询逻辑）
import { useState, useEffect, useCallback } from 'react';
import { Video, Image, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, Badge } from '../ui';
import { useModelStore } from '../../stores/useModelStore';
import { getModelKey } from '../../types/model';
import { videoService, type ShotVideoInterval, type ShotKeyframe } from '../../services/videoService';
import apiClient from '../../services/apiClient';
import { getVideoModelConfig } from '../../config/videoModelConfig';
import type { Shot } from '../../types';
import { useStoredModelKey } from './useStoredModelKey';
import { VideoParamsPanel } from './VideoParamsPanel';

const shotSizeLabels: Record<string, string> = {
  extreme_close_up: '大特写',
  extreme_closeup: '大特写',
  close_up: '特写',
  closeup: '特写',
  medium_close_up: '近景',
  medium_closeup: '近景',
  medium: '中景',
  medium_long: '中全景',
  long: '全景',
  full: '全景',
  extreme_long: '远景',
  extreme_wide: '大远景',
};

const cameraLabels: Record<string, string> = {
  static: '固定',
  pan: '摇镜',
  tilt: '俯仰',
  dolly_in: '推进',
  dolly_out: '拉远',
  tracking: '跟拍',
  crane: '升降',
  handheld: '手持',
  zoom: '变焦',
};

interface ShotCardProps {
  shot: Shot;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  sceneName?: string;
}

// 解析 characters_in_shot（后端已解析为 JSON 数组）
function parseShotCharacterNames(shot: Shot): string[] {
  if (!Array.isArray(shot.characters_in_shot)) return [];
  return shot.characters_in_shot.map((s: unknown) => String(s)).filter(Boolean);
}

export function ShotCard({ shot, index, isExpanded, onToggle, showToast, sceneName }: ShotCardProps) {
  const { configs, loadConfigs } = useModelStore();
  const [keyframes, setKeyframes] = useState<ShotKeyframe[]>([]);
  const [videos, setVideos] = useState<ShotVideoInterval[]>([]);
  const [isGeneratingKeyframe, setIsGeneratingKeyframe] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [selectedImageModel, setSelectedImageModel] = useStoredModelKey('moo:last_image_model');
  const [selectedVideoModel, setSelectedVideoModel] = useStoredModelKey('moo:last_video_model');
  const [motionPrompt, setMotionPrompt] = useState('');
  const [videoRatio, setVideoRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9'>('16:9');
  const [videoResolution, setVideoResolution] = useState<'720p' | '1080p' | '2k' | '4k'>('1080p');
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoSubtitles, setVideoSubtitles] = useState(false);
  const [pollingVideoId, setPollingVideoId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [useNextFirstFrame, setUseNextFirstFrame] = useState<boolean>(shot.use_next_first_frame !== 0);
  const [isGeneratingCandidates, setIsGeneratingCandidates] = useState(false);
  const [isGeneratingEndFrame, setIsGeneratingEndFrame] = useState(false);

  // 当前视频模型的参数配置
  const videoConfig = selectedVideoModel ? getVideoModelConfig(selectedVideoModel) : null;

  // 切换视频模型时自动设置默认参数
  useEffect(() => {
    if (videoConfig) {
      setVideoRatio(videoConfig.defaultRatio as any);
      setVideoResolution(videoConfig.defaultResolution as any);
      setVideoDuration(videoConfig.defaultDuration);
      setVideoSubtitles(false);
    }
  }, [selectedVideoModel]); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载模型配置并自动设置默认模型
  useEffect(() => {
    if (!configs.image || configs.image.length === 0) {
      loadConfigs();
    }
  }, [configs, loadConfigs]);

  useEffect(() => {
    const imgModels = configs.image?.filter(m => m.is_active) || [];
    if (!selectedImageModel && imgModels.length > 0) {
      // 优先选第一个已配置模型，避免默认模型未配置
      setSelectedImageModel(getModelKey(imgModels[0].provider, imgModels[0].model_name));
    }
    const vidModels = configs.video?.filter(m => m.is_active) || [];
    if (!selectedVideoModel && vidModels.length > 0) {
      setSelectedVideoModel(getModelKey(vidModels[0].provider, vidModels[0].model_name));
    }
  }, [configs, selectedImageModel, selectedVideoModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = useCallback(async () => {
    try {
      const [kfRes, vidRes] = await Promise.all([
        videoService.getKeyframes(shot.id),
        videoService.listByShot(shot.id),
      ]);
      if (kfRes.success) setKeyframes(kfRes.data || []);
      if (vidRes.success) setVideos(vidRes.data || []);
    } catch {
      // 静默
    }
  }, [shot.id]);

  useEffect(() => {
    if (isExpanded) {
      loadData();
    }
  }, [isExpanded, loadData]);

  useEffect(() => {
    if (!pollingVideoId) return;
    const startTime = Date.now();
    const TIMEOUT_MS = 10 * 60 * 1000; // 10分钟超时
    const poll = async () => {
      // 检查超时
      if (Date.now() - startTime > TIMEOUT_MS) {
        setPollingVideoId(null);
        showToast('视频生成超时，请稍后重试或检查模型状态', 'error');
        return;
      }
      try {
        const res = await videoService.getStatus(pollingVideoId);
        if (res.success && res.data) {
          // 仅在内容有变化时更新：新对象引用会让"已等待 X 秒"计时器 effect 每 5s 重建重置
          setVideos(prev => {
            const exists = prev.find(v => v.id === pollingVideoId);
            if (!exists) return prev;
            if (exists.status === res.data!.status &&
                exists.external_task_id === res.data!.external_task_id &&
                exists.video_url === res.data!.video_url) {
              return prev;
            }
            return prev.map(v => v.id === pollingVideoId ? res.data! : v);
          });
          if (res.data.status === 'completed' || res.data.status === 'failed') {
            setPollingVideoId(null);
            if (res.data.status === 'completed') {
              showToast('视频生成完成。下一步：进入「导出」阶段合成成片', 'success');
            } else {
              const qMsg = (res.data as any)?.error_message || '视频生成失败';
              showToast(qMsg, 'error');
            }
          }
        }
      } catch {
        // 静默
      }
    };
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [pollingVideoId, showToast]);

  const firstKeyframe = keyframes.find(k => k.frame_type === 'first') || keyframes[0];
  const candidates = keyframes.filter(k => k.frame_type === 'candidate' && k.image_url);
  const endFrame = keyframes.find(k => k.frame_type === 'end' && k.image_url);
  const completedVideo = videos.find(v => v.status === 'completed');
  const processingVideo = videos.find(v => v.status === 'processing' || v.status === 'pending' || v.status === 'generating');
  const failedVideo = videos.find(v => v.status === 'failed');

  // 视频生成计时器
  useEffect(() => {
    if (!processingVideo && !isGeneratingVideo) {
      setElapsedTime(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [processingVideo, isGeneratingVideo]);

  // 删除视频（停止生成）
  const handleDeleteVideo = async (videoId: string) => {
    setIsDeletingVideo(true);
    try {
      await videoService.delete(videoId);
      setVideos(prev => prev.filter(v => v.id !== videoId));
      if (pollingVideoId === videoId) {
        setPollingVideoId(null);
      }
      showToast('视频已删除', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || '删除失败', 'error');
    } finally {
      setIsDeletingVideo(false);
    }
  };

  const handleGenerateKeyframe = async () => {
    if (!selectedImageModel) {
      showToast('请选择图像模型', 'error');
      return;
    }
    const [provider, modelName] = selectedImageModel.split(':');
    if (!provider || !modelName) {
      showToast('模型格式错误', 'error');
      return;
    }
    setIsGeneratingKeyframe(true);
    try {
      const res = await apiClient.post<unknown, { success?: boolean; data?: ShotKeyframe[]; message?: string }>(`/shots/${shot.id}/keyframes/generate`, {
        provider,
        modelName,
        frameTypes: ['first'],
      });
      if (res.success && res.data) {
        setKeyframes(res.data as unknown as ShotKeyframe[]);
        showToast('关键帧生成成功。下一步：选择视频模型生成该镜头视频', 'success');
      } else {
        showToast(res.message || '关键帧生成失败', 'error');
      }
    } catch (err: any) {
      // 显示具体错误信息
      const errorMsg = err?.response?.data?.message || err?.message || '关键帧生成失败';
      showToast(errorMsg, 'error');
      console.error('[Keyframe] 生成失败:', err);
    } finally {
      setIsGeneratingKeyframe(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!selectedVideoModel) {
      showToast('请选择视频模型', 'error');
      return;
    }
    if (!firstKeyframe) {
      showToast('请先生成首帧关键帧', 'error');
      return;
    }
    setIsGeneratingVideo(true);
    try {
      const res = await videoService.generate(shot.id, {
        provider: selectedVideoModel.split(':')[0],
        modelName: selectedVideoModel.split(':')[1],
        keyframeId: firstKeyframe.id,
        motionPrompt: motionPrompt || shot.action_description,
        duration: videoDuration,
        ratio: videoRatio,
        resolution: videoResolution,
        subtitles: videoSubtitles,
      });
      if (res.success && res.data) {
        setVideos(prev => [...prev, res.data!]);
        setPollingVideoId(res.data.id);
        showToast('视频生成任务已创建，正在处理中...', 'info');
      }
    } catch {
      showToast('视频生成失败，请检查模型配置', 'error');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // 切换首尾帧衔接（下镜首帧作尾帧）——保存到镜头，后端视频生成时自动生效
  const handleToggleUseNextFirstFrame = async (v: boolean) => {
    setUseNextFirstFrame(v);
    try {
      await apiClient.put(`/shots/${shot.id}`, { use_next_first_frame: v ? 1 : 0 });
      showToast(v ? '首尾帧衔接已开启：视频起止画面硬锁定' : '已关闭首尾帧衔接', 'success');
    } catch {
      showToast('首尾帧设置保存失败', 'error');
    }
  };

  // 生成九宫格候选关键帧（BigBanana 方案：多视角候选选首帧）
  const handleGenerateCandidates = async () => {
    if (!selectedImageModel) {
      showToast('请选择图像模型', 'error');
      return;
    }
    const [provider, modelName] = selectedImageModel.split(':');
    if (!provider || !modelName) {
      showToast('模型格式错误', 'error');
      return;
    }
    setIsGeneratingCandidates(true);
    try {
      const res = await apiClient.post<unknown, { success?: boolean; data?: ShotKeyframe[]; message?: string }>(`/shots/${shot.id}/keyframes/candidates`, {
        provider,
        modelName,
        count: 4,
      });
      if (res.success && res.data) {
        setKeyframes(prev => {
          const newCands = res.data as unknown as ShotKeyframe[];
          const existingIds = new Set(prev.map(k => k.id));
          return [...prev, ...newCands.filter(k => !existingIds.has(k.id))];
        });
        showToast('已生成 4 个候选视角，点击缩略图选择为首帧', 'success');
      } else {
        showToast(res.message || '候选生成失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '候选生成失败', 'error');
    } finally {
      setIsGeneratingCandidates(false);
    }
  };

  // 选择候选帧升级为首帧
  const handleSelectCandidate = async (kfId: string) => {
    try {
      const res = await apiClient.post<unknown, { success?: boolean; data?: ShotKeyframe; message?: string }>(`/keyframes/${kfId}/select`);
      if (res.success && res.data) {
        const kfRes = await videoService.getKeyframes(shot.id);
        if (kfRes.success) setKeyframes(kfRes.data || []);
        showToast('已选择该候选帧作为首帧', 'success');
      } else {
        showToast(res.message || '选择失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '选择失败', 'error');
    }
  };

  // 生成显式尾帧（End Frame，动作/情绪转折镜头推荐）：之后该镜视频首尾帧插值
  const handleGenerateEndFrame = async () => {
    if (!selectedImageModel) {
      showToast('请选择图像模型', 'error');
      return;
    }
    const [provider, modelName] = selectedImageModel.split(':');
    if (!provider || !modelName) {
      showToast('模型格式错误', 'error');
      return;
    }
    setIsGeneratingEndFrame(true);
    try {
      const res = await apiClient.post<unknown, { success?: boolean; data?: ShotKeyframe; message?: string }>(`/shots/${shot.id}/keyframes/endframe`, {
        provider,
        modelName,
      });
      if (res.success && res.data) {
        setKeyframes(prev => {
          const exists = prev.some(k => k.id === res.data!.id);
          return exists ? prev : [...prev, res.data as unknown as ShotKeyframe];
        });
        showToast('尾帧已生成：该镜视频将做首尾帧插值', 'success');
      } else {
        showToast(res.message || '尾帧生成失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '尾帧生成失败', 'error');
    } finally {
      setIsGeneratingEndFrame(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[var(--panel-2)]/30 transition-colors"
        onClick={onToggle}
      >
        <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-[var(--accent)] font-mono">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="default">{shotSizeLabels[shot.shot_size] || shot.shot_size}</Badge>
            <Badge variant="default">{cameraLabels[shot.camera_movement] || shot.camera_movement}</Badge>
            {sceneName && <Badge variant="accent">🎬 {sceneName}</Badge>}
            {parseShotCharacterNames(shot).map((name, i) => (
              <Badge key={`${name}-${i}`} variant="info">👤 {name}</Badge>
            ))}
            <span className="text-xs text-[var(--ink-3)]">{shot.duration_seconds}s</span>
          </div>
          <p className="text-sm text-[var(--ink-1)] line-clamp-1">{shot.action_description}</p>
          {shot.dialogue && (
            <p className="text-xs text-[var(--ink-3)] line-clamp-1 mt-0.5">"{shot.dialogue}"</p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleGenerateKeyframe(); }}
            disabled={isGeneratingKeyframe}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${firstKeyframe ? 'text-green-600 dark:text-green-400 bg-green-50 hover:bg-green-100' : 'text-[var(--ink-3)] hover:bg-[var(--panel-2)]'} ${isGeneratingKeyframe ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isGeneratingKeyframe ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
            <span>{isGeneratingKeyframe ? '生成中' : firstKeyframe ? '首帧✓' : '首帧'}</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleGenerateVideo(); }}
            disabled={!firstKeyframe || !!processingVideo || isGeneratingVideo}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${completedVideo ? 'text-green-600 dark:text-green-400 bg-green-50' : processingVideo ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-50' : !firstKeyframe ? 'text-[var(--ink-3)] opacity-50 cursor-not-allowed' : 'text-[var(--ink-3)] hover:bg-[var(--panel-2)]'} ${isGeneratingVideo ? 'opacity-50' : ''}`}
          >
            {processingVideo || isGeneratingVideo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            <span>{processingVideo || isGeneratingVideo ? '生成中' : completedVideo ? '视频✓' : '视频'}</span>
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--ink-3)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--ink-3)]" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div
          className="border-t border-[var(--border)] p-4 bg-[var(--panel-2)]/20"
          style={{ position: 'relative', zIndex: 10, pointerEvents: 'auto' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 首帧区域 */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--ink-1)] flex items-center gap-1.5 mb-2">
                <Image className="w-4 h-4 text-[var(--accent)]" />
                首帧关键帧
              </h4>
              <div className="aspect-video bg-[var(--panel-2)] rounded-lg overflow-hidden flex items-center justify-center border border-[var(--border)]">
                {firstKeyframe?.image_url ? (
                  <img src={firstKeyframe.image_url} alt="首帧" className="w-full h-full object-cover" />
                ) : isGeneratingKeyframe ? (
                  <div className="text-center text-[var(--ink-3)]">
                    <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-[var(--accent)]" />
                    <p className="text-xs">首帧生成中...</p>
                  </div>
                ) : (
                  <div className="text-center text-[var(--ink-3)]">
                    <Image className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">点击上方「首帧」按钮生成</p>
                  </div>
                )}
              </div>

              {/* 九宫格候选 + 显式尾帧 */}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleGenerateCandidates}
                  disabled={isGeneratingCandidates}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors ${isGeneratingCandidates ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--panel-2)]'}`}
                  style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}
                >
                  {isGeneratingCandidates ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Image className="w-3 h-3" />}
                  {isGeneratingCandidates ? '生成中...' : `候选×4${candidates.length > 0 ? `(${candidates.length})` : ''}`}
                </button>
                {endFrame && (
                  <span className="px-2 py-1 rounded-md text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                    尾帧✓
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleGenerateEndFrame}
                  disabled={isGeneratingEndFrame}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors ${isGeneratingEndFrame ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--panel-2)]'}`}
                  style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}
                >
                  {isGeneratingEndFrame ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Image className="w-3 h-3" />}
                  {isGeneratingEndFrame ? '生成中...' : '生成尾帧'}
                </button>
                {useNextFirstFrame && (
                  <span className="px-2 py-1 rounded-md text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    自动尾帧
                  </span>
                )}
              </div>

              {/* 候选帧选择行 */}
              {candidates.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-[var(--ink-3)] mb-1">候选视角（点击选用为首帧）</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {candidates.map(kf => (
                      <button
                        key={kf.id}
                        type="button"
                        onClick={() => handleSelectCandidate(kf.id)}
                        className="relative w-24 flex-shrink-0 aspect-video rounded-md overflow-hidden border-2 border-transparent hover:border-[var(--accent)] transition-colors"
                      >
                        <img src={kf.image_url ?? ''} alt="候选帧" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center py-0.5">
                          {kf.candidate_index ?? '候'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 视频区域 */}
            <div>
              <h4 className="text-sm font-semibold text-[var(--ink-1)] flex items-center gap-1.5 mb-2">
                <Video className="w-4 h-4 text-[var(--accent)]" />
                视频片段
              </h4>
              <div className="aspect-video bg-[var(--panel-2)] rounded-lg overflow-hidden flex items-center justify-center border border-[var(--border)]">
                {completedVideo?.video_url ? (
                  <video src={completedVideo.video_url} controls className="w-full h-full object-contain bg-black" />
                ) : processingVideo || isGeneratingVideo ? (
                  <div className="text-center text-[var(--ink-3)] w-full px-4">
                    <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin text-yellow-500" />
                    <p className="text-xs text-[var(--ink-1)]">视频生成中，请稍候...</p>
                    <p className="text-[10px] text-[var(--ink-3)] mt-1">已等待 {elapsedTime} 秒 · 通常需要 30-120 秒</p>
                    {/* 进度条 */}
                    <div className="w-full h-1.5 bg-[var(--panel-3)] rounded-full mt-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(95, (elapsedTime / 120) * 100)}%` }}
                      />
                    </div>
                    {/* 停止按钮 */}
                    <button
                      onClick={() => processingVideo && handleDeleteVideo(processingVideo.id)}
                      disabled={isDeletingVideo || !processingVideo}
                      className="mt-3 px-3 py-1 text-[10px] text-red-500 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      {isDeletingVideo ? '删除中...' : '停止并删除'}
                    </button>
                  </div>
                ) : failedVideo ? (
                  <div className="text-center text-red-500">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-xs">视频生成失败</p>
                    <p className="text-[10px] text-[var(--ink-3)] mt-1">{failedVideo.error_message}</p>
                  </div>
                ) : (
                  <div className="text-center text-[var(--ink-3)]">
                    <Video className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">先生成首帧，再点击「视频」生成</p>
                  </div>
                )}
              </div>

              {/* 视频参数选择 */}
              {!completedVideo && !processingVideo && !isGeneratingVideo && videoConfig && (
                <VideoParamsPanel
                  videoConfig={videoConfig}
                  selectedVideoModel={selectedVideoModel}
                  onModelChange={setSelectedVideoModel}
                  videoRatio={videoRatio}
                  onRatioChange={setVideoRatio}
                  videoResolution={videoResolution}
                  onResolutionChange={setVideoResolution}
                  videoDuration={videoDuration}
                  onDurationChange={setVideoDuration}
                  videoSubtitles={videoSubtitles}
                  onSubtitlesChange={setVideoSubtitles}
                  motionPrompt={motionPrompt}
                  onMotionPromptChange={setMotionPrompt}
                  useNextFirstFrame={useNextFirstFrame}
                  onUseNextFirstFrameChange={handleToggleUseNextFirstFrame}
                />
              )}

              {/* 未配置视频模型时的友好提示 */}
              {!completedVideo && !processingVideo && !isGeneratingVideo && !videoConfig && firstKeyframe && (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">请先在模型配置中添加视频模型（豆包 / 可灵 / 即梦等）</p>
                </div>
              )}

              {completedVideo && (
                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--ink-3)]">
                  <span>模型: {completedVideo.video_model_used}</span>
                  <span>·</span>
                  <span>{completedVideo.duration_seconds}s</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[var(--ink-3)] text-xs">动作描述</span>
                <p className="text-[var(--ink-1)] mt-1">{shot.action_description}</p>
              </div>
              {shot.dialogue && (
                <div>
                  <span className="text-[var(--ink-3)] text-xs">台词</span>
                  <p className="text-[var(--ink-1)] mt-1 italic">"{shot.dialogue}"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
