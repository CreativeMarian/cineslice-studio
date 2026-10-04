// 分镜动作 Hook：生成首帧 / 生成视频 / 删首帧 / 删镜头
// ShotCard（紧凑展示卡）与 ShotDetailPanel（右侧详情面板）共用，避免同一逻辑两份漂移
// 模型取批量工具栏记忆的 moo:last_image_model / moo:last_video_model，缺省回退第一个已配置模型
import { useState, useEffect } from 'react';
import { useModelStore } from '../../stores/useModelStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { videoService, type ShotKeyframe } from '../../services/videoService';
import { shotService } from '../../services/shotService';
import { getVideoModelConfig } from '../../config/videoModelConfig';
import { showApiError, getResponseErrorMessage } from '../../utils/error';
import { resolveImageModel, resolveVideoModel } from './shotUtils';
import type { Shot } from '../../types';
import type { ToastType } from '../../stores/useUIStore';

export function useShotActions(
  shot: Shot,
  index: number,
  showToast: (msg: string, type: ToastType) => void,
  onDeleted?: () => void
) {
  const { configs, loadConfigs } = useModelStore();
  const { setKeyframesForShot, setVideosForShot } = useProjectStore();
  const [isGeneratingKeyframe, setIsGeneratingKeyframe] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

  // 挂载时加载模型配置（选择器渲染需要）
  useEffect(() => {
    if (!configs.image || configs.image.length === 0 || !configs.video || configs.video.length === 0) {
      loadConfigs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P2-前端1: 关键帧/视频从 store 缓存读取（StageDirectorPage 加载分镜后一次性批量加载全集，本组件不再单独发请求）
  const keyframes = useProjectStore((s) => s.keyframesByShot[shot.id]) || [];
  const videos = useProjectStore((s) => s.videosByShot[shot.id]) || [];

  const firstKeyframe = keyframes.find((k) => k.frame_type === 'first') || keyframes[0];
  const completedVideo = videos.find((v) => v.status === 'completed');
  const processingVideo = videos.find((v) => v.status === 'processing' || v.status === 'pending' || v.status === 'generating');
  const failedVideo = videos.find((v) => v.status === 'failed');

  const handleGenerateKeyframe = async (customPrompt?: string) => {
    const model = resolveImageModel(configs.image);
    if (!model) {
      showToast('请先在模型配置中添加图像模型，或在批量工具栏选择首帧模型', 'error');
      return;
    }
    setIsGeneratingKeyframe(true);
    try {
      const res = await shotService.generateKeyframes(shot.id, {
        provider: model.provider,
        modelName: model.modelName,
        frameTypes: ['first'],
        referenceSceneId: shot.scene_id || undefined,
        // 角色参考缺省由后端按 characters_in_shot 自动收集（防旧图缓存与角色漂移）
        custom_prompt: customPrompt,
      });
      if (res.success && res.data) {
        setKeyframesForShot(shot.id, res.data as unknown as ShotKeyframe[]);
        showToast(`第 ${index + 1} 镜首帧生成成功`, 'success');
        // P2-10: 通知导演台刷新（分段视图依赖镜头状态，需重新拉取段列表）
        window.dispatchEvent(new CustomEvent('shot-keyframe-generated', { detail: { shotId: shot.id } }));
      } else {
        showToast(getResponseErrorMessage(res, '首帧生成失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '首帧生成失败');
      console.error('[ShotCard] 首帧生成失败:', err);
    } finally {
      setIsGeneratingKeyframe(false);
    }
  };

  const handleGenerateVideo = async (customPrompt?: string) => {
    if (!firstKeyframe) {
      showToast('请先生成首帧，再生成视频', 'error');
      return;
    }
    const model = resolveVideoModel(configs.video);
    if (!model) {
      showToast('请先在模型配置中添加视频模型，或在批量工具栏选择视频模型', 'error');
      return;
    }
    // 使用默认参数：模型默认比例/分辨率/时长（无参数面板）
    const config = getVideoModelConfig(`${model.provider}:${model.modelName}`);
    const duration = Math.min(Math.max(shot.duration_seconds || config.defaultDuration, 1), 15);
    setIsGeneratingVideo(true);
    try {
      const res = await videoService.generate(shot.id, {
        provider: model.provider,
        modelName: model.modelName,
        keyframeId: firstKeyframe.id,
        motionPrompt: shot.action_description,
        duration,
        ratio: config.defaultRatio as '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9',
        resolution: config.defaultResolution as '720p' | '1080p' | '2k' | '4k',
        subtitles: false,
        custom_prompt: customPrompt,
      });
      if (res.success && res.data) {
        const currentVideos = useProjectStore.getState().videosByShot[shot.id] || [];
        setVideosForShot(shot.id, [...currentVideos, res.data!]);
        showToast(`第 ${index + 1} 镜视频生成任务已创建`, 'info');
      } else {
        showToast(getResponseErrorMessage(res, '视频生成失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '视频生成失败');
      console.error('[ShotCard] 视频生成失败:', err);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleDeleteShot = async () => {
    if (!window.confirm(`确定删除第 ${index + 1} 镜吗？此操作会同时删除该镜的首帧、视频与音频，且不可恢复。`)) return;
    try {
      const res = await shotService.delete(shot.id);
      if (res.success) {
        showToast('镜头已删除', 'success');
        onDeleted?.();
      } else {
        showToast('删除失败', 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '删除失败');
    }
  };

  // 删除首帧（只删关键帧图片，不删除镜头，删除后可重新生成）
  const handleDeleteKeyframe = async () => {
    if (!firstKeyframe) return;
    if (!window.confirm(`确定删除第 ${index + 1} 镜的首帧吗？删除后可重新生成，镜头数据保留。`)) return;
    try {
      const res = await shotService.deleteKeyframe(firstKeyframe.id);
      if (res.success) {
        const currentKeyframes = useProjectStore.getState().keyframesByShot[shot.id] || [];
        setKeyframesForShot(shot.id, currentKeyframes.filter((k) => k.id !== firstKeyframe.id));
        showToast('首帧已删除，可重新生成', 'success');
      } else {
        showToast('删除失败', 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '删除失败');
    }
  };

  return {
    keyframes,
    videos,
    firstKeyframe,
    completedVideo,
    processingVideo,
    failedVideo,
    isGeneratingKeyframe,
    isGeneratingVideo,
    handleGenerateKeyframe,
    handleGenerateVideo,
    handleDeleteKeyframe,
    handleDeleteShot,
  };
}
