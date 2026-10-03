// 分镜卡片（导演台精简版）：首帧缩略图 + 镜头信息 + 3 个操作（生成首帧/生成视频/删除）+ 视频状态
// 数据自含：挂载时加载该镜关键帧与视频列表；生成视频后自动轮询真实进度
// 使用默认参数（模型取批量工具栏记忆的 moo:last_image_model / moo:last_video_model，缺省回退第一个已配置模型）
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Video, Image, RefreshCw, Trash2, AlertCircle, Clock, Film } from 'lucide-react';
import { Card, Badge, ImageModal, Spinner } from '../ui';
import { useModelStore } from '../../stores/useModelStore';
import { videoService, type ShotVideoInterval, type ShotKeyframe } from '../../services/videoService';
import { shotService } from '../../services/shotService';
import { getVideoModelConfig } from '../../config/videoModelConfig';
import type { Shot } from '../../types';
import type { ToastType } from '../../stores/useUIStore';

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
  /** 全局镜头序号（1 起） */
  index: number;
  showToast: (msg: string, type: ToastType) => void;
  /** 删除成功后回调（父级刷新镜头列表） */
  onDeleted?: () => void;
}

// 读取 localStorage 中的模型记忆（与批量工具栏共用同一存储键，单镜/批量模型选择一致）
function readStoredModelKey(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

// 解析 characters_in_shot（后端已解析为角色名数组）
function parseShotCharacterNames(shot: Shot): string[] {
  if (!Array.isArray(shot.characters_in_shot)) return [];
  return shot.characters_in_shot.map((s: unknown) => String(s)).filter(Boolean);
}

export function ShotCard({ shot, index, showToast, onDeleted }: ShotCardProps) {
  const { configs, loadConfigs } = useModelStore();
  const [keyframes, setKeyframes] = useState<ShotKeyframe[]>([]);
  const [videos, setVideos] = useState<ShotVideoInterval[]>([]);
  const [isGeneratingKeyframe, setIsGeneratingKeyframe] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 挂载时加载模型配置（选择器渲染需要）
  useEffect(() => {
    if (!configs.image || configs.image.length === 0) {
      loadConfigs();
    }
  }, [configs, loadConfigs]);

  // 加载该镜关键帧与视频列表
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [kfRes, vidRes] = await Promise.all([
          videoService.getKeyframes(shot.id),
          videoService.listByShot(shot.id),
        ]);
        if (cancelled) return;
        if (kfRes.success) setKeyframes(kfRes.data || []);
        if (vidRes.success) setVideos(vidRes.data || []);
      } catch {
        // 静默
      }
    })();
    return () => { cancelled = true; };
  }, [shot.id]);

  const firstKeyframe = keyframes.find(k => k.frame_type === 'first') || keyframes[0];
  const completedVideo = videos.find(v => v.status === 'completed');
  const processingVideo = videos.find(v => v.status === 'processing' || v.status === 'pending' || v.status === 'generating');
  const failedVideo = videos.find(v => v.status === 'failed');

  // 生成中视频轮询（挂载后若存在 processing 视频也会自动续轮询，刷新页面可恢复进度显示）
  useEffect(() => {
    if (!processingVideo) {
      setVideoProgress(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await videoService.getStatus(processingVideo.id);
        if (cancelled || !res.success || !res.data) return;
        setVideos(prev => {
          const exists = prev.find(v => v.id === processingVideo.id);
          if (!exists) return prev;
          if (exists.status === res.data!.status && exists.video_url === res.data!.video_url) {
            return prev;
          }
          return prev.map(v => v.id === processingVideo.id ? res.data! : v);
        });
        if (typeof res.data.progress === 'number') {
          setVideoProgress(res.data.progress);
        }
        if (res.data.status === 'completed') {
          setVideoProgress(100);
          showToast(`第 ${index + 1} 镜视频生成完成`, 'success');
        } else if (res.data.status === 'failed') {
          setVideoProgress(0);
          showToast(res.data.error_message || `第 ${index + 1} 镜视频生成失败`, 'error');
        }
      } catch {
        // 轮询失败静默，下个周期重试
      }
    };
    const timer = window.setInterval(poll, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [processingVideo?.id, index, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // 生成中计时
  useEffect(() => {
    if (!processingVideo && !isGeneratingVideo) {
      setElapsedTime(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [processingVideo, isGeneratingVideo]);

  // 解析当前图像模型（记忆优先，缺省第一个已配置）
  const resolveImageModel = useCallback(() => {
    const stored = readStoredModelKey('moo:last_image_model');
    if (stored) {
      const [provider, modelName] = stored.split(':');
      if (provider && modelName) return { provider, modelName };
    }
    const models = configs.image?.filter(m => m.is_active) || [];
    if (models.length === 0) return null;
    return { provider: models[0].provider, modelName: models[0].model_name };
  }, [configs.image]);

  // 解析当前视频模型
  const resolveVideoModel = useCallback(() => {
    const stored = readStoredModelKey('moo:last_video_model');
    if (stored) {
      const [provider, modelName] = stored.split(':');
      if (provider && modelName) return { provider, modelName };
    }
    const models = configs.video?.filter(m => m.is_active) || [];
    if (models.length === 0) return null;
    return { provider: models[0].provider, modelName: models[0].model_name };
  }, [configs.video]);

  const handleGenerateKeyframe = async () => {
    const model = resolveImageModel();
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
        // 角色参考缺省由后端按 characters_in_shot 自动收集（防旧图缓存与角色漂移）
      });
      if (res.success && res.data) {
        setKeyframes(res.data as unknown as ShotKeyframe[]);
        showToast(`第 ${index + 1} 镜首帧生成成功`, 'success');
      } else {
        showToast(res.error?.message || '首帧生成失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || '首帧生成失败', 'error');
      console.error('[ShotCard] 首帧生成失败:', err);
    } finally {
      setIsGeneratingKeyframe(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!firstKeyframe) {
      showToast('请先生成首帧，再生成视频', 'error');
      return;
    }
    const model = resolveVideoModel();
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
      });
      if (res.success && res.data) {
        setVideos(prev => [...prev, res.data!]);
        setVideoProgress(0);
        showToast(`第 ${index + 1} 镜视频生成任务已创建`, 'info');
      } else {
        showToast(res.error?.message || '视频生成失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || '视频生成失败', 'error');
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
    } catch (err: any) {
      showToast(err?.response?.data?.message || '删除失败', 'error');
    }
  };

  // 删除首帧（只删关键帧图片，不删除镜头，删除后可重新生成）
  const handleDeleteKeyframe = async () => {
    if (!firstKeyframe) return;
    if (!window.confirm(`确定删除第 ${index + 1} 镜的首帧吗？删除后可重新生成，镜头数据保留。`)) return;
    try {
      const res = await shotService.deleteKeyframe(firstKeyframe.id);
      if (res.success) {
        setKeyframes(prev => prev.filter(k => k.id !== firstKeyframe.id));
        showToast('首帧已删除，可重新生成', 'success');
      } else {
        showToast('删除失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '删除失败', 'error');
    }
  };

  const characters = parseShotCharacterNames(shot);
  const dialogueLine = shot.dialogue
    ? `${characters.length > 0 ? `${characters.join(' / ')}：` : ''}“${shot.dialogue}”`
    : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-stretch gap-4 p-4 flex-wrap lg:flex-nowrap">
        {/* 首帧缩略图（点击放大预览） */}
        <button
          type="button"
          onClick={() => firstKeyframe?.image_url && setPreviewOpen(true)}
          disabled={!firstKeyframe?.image_url}
          className="w-36 h-20 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--panel-2)] flex-shrink-0 flex items-center justify-center disabled:cursor-default"
          title={firstKeyframe?.image_url ? '点击放大预览首帧' : '尚无首帧'}
        >
          {firstKeyframe?.image_url ? (
            <img src={firstKeyframe.image_url} alt={`第${index + 1}镜首帧`} className="w-full h-full object-cover" />
          ) : isGeneratingKeyframe ? (
            <div className="flex flex-col items-center gap-1 text-[var(--ink-3)]">
              <RefreshCw className="w-5 h-5 animate-spin text-[var(--accent)]" />
              <span className="text-[10px]">首帧生成中</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-[var(--ink-3)]">
              <Image className="w-5 h-5 opacity-60" />
              <span className="text-[10px]">暂无首帧</span>
            </div>
          )}
        </button>

        {/* 镜头信息 */}
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <Badge variant="accent" className="font-mono">
              {String(index + 1).padStart(2, '0')} 镜
            </Badge>
            <Badge variant="default">{shotSizeLabels[shot.shot_size] || shot.shot_size}</Badge>
            <Badge variant="default">{cameraLabels[shot.camera_movement] || shot.camera_movement}</Badge>
            <span className="text-xs text-[var(--ink-3)]">{shot.duration_seconds}s</span>
            {characters.slice(0, 3).map((name, i) => (
              <Badge key={`${name}-${i}`} variant="info">👤 {name}</Badge>
            ))}
            {/* 视频状态徽章 */}
            {!firstKeyframe && <Badge variant="danger">⚠ 缺首帧</Badge>}
            {firstKeyframe && !completedVideo && !processingVideo && !isGeneratingVideo && (
              <Badge variant="warning">⏳ 待生成视频</Badge>
            )}
            {processingVideo && <Badge variant="info">🎬 视频生成中</Badge>}
            {completedVideo && <Badge variant="success">✓ 视频已完成</Badge>}
            {failedVideo && !processingVideo && <Badge variant="danger">✗ 视频失败</Badge>}
          </div>
          <p className="text-sm text-[var(--ink-1)] line-clamp-2">{shot.action_description}</p>
          {dialogueLine && (
            <p className="text-xs text-[var(--ink-3)] line-clamp-1 mt-1">{dialogueLine}</p>
          )}
        </div>

        {/* 操作按钮（3 个）：生成首帧 / 生成视频 / 删除 */}
        <div className="flex flex-row lg:flex-col gap-1.5 flex-shrink-0 items-start">
          <button
            type="button"
            onClick={handleGenerateKeyframe}
            disabled={isGeneratingKeyframe}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${
              firstKeyframe
                ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-500/20 hover:bg-green-100 dark:hover:bg-green-900/40'
                : 'text-[var(--ink-2)] bg-[var(--panel-2)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            } ${isGeneratingKeyframe ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isGeneratingKeyframe ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
            <span>{isGeneratingKeyframe ? '生成中' : firstKeyframe ? '重新生成首帧' : '生成首帧'}</span>
          </button>
          <button
            type="button"
            onClick={handleGenerateVideo}
            disabled={!firstKeyframe || !!processingVideo || isGeneratingVideo}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${
              completedVideo
                ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-500/20 hover:bg-green-100 dark:hover:bg-green-900/40'
                : processingVideo || isGeneratingVideo
                ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500/20'
                : !firstKeyframe
                ? 'text-[var(--ink-3)] opacity-50 cursor-not-allowed bg-[var(--panel-2)] border-[var(--border)]'
                : 'text-[var(--ink-2)] bg-[var(--panel-2)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
            }`}
          >
            {processingVideo || isGeneratingVideo ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Video className="w-3.5 h-3.5" />
            )}
            <span>{processingVideo || isGeneratingVideo ? '生成中' : '生成视频'}</span>
          </button>
          {/* 删除首帧（只删图片，不删镜头，仅在有首帧时显示） */}
          {firstKeyframe && (
            <button
              type="button"
              onClick={handleDeleteKeyframe}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-[var(--ink-3)] hover:bg-orange-500/10 hover:text-orange-500"
              title="删除首帧图片（镜头数据保留，可重新生成）"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删首帧</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDeleteShot}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-[var(--ink-3)] hover:bg-red-500/10 hover:text-red-500"
            title="删除整个镜头（连带首帧/视频/音频，不可恢复）"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删镜头</span>
          </button>
        </div>

        {/* 视频状态展示 */}
        <div className="w-44 flex-shrink-0 hidden md:flex flex-col justify-center">
          {completedVideo?.video_url ? (
            <video
              src={completedVideo.video_url}
              controls
              preload="metadata"
              className="w-full aspect-video rounded-lg bg-black object-cover"
            />
          ) : processingVideo || isGeneratingVideo ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1.5">
                <Spinner size="sm" />
                <span className="text-xs text-[var(--ink-1)]">视频生成中</span>
              </div>
              <p className="text-[10px] text-[var(--ink-3)] flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" /> 已等待 {elapsedTime} 秒
              </p>
              <div className="w-full h-1 bg-[var(--panel-3)] rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] rounded-full transition-all duration-1000"
                  style={{ width: videoProgress != null ? `${videoProgress}%` : '8%' }}
                />
              </div>
              {videoProgress != null && (
                <p className="text-[10px] text-[var(--ink-2)] mt-1">渲染进度 {Math.round(videoProgress)}%</p>
              )}
            </div>
          ) : failedVideo ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-center">
              <AlertCircle className="w-5 h-5 mx-auto mb-1 text-red-500" />
              <p className="text-[10px] text-red-500 line-clamp-2">{failedVideo.error_message || '视频生成失败，可点击「生成视频」重试'}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-2)]/50 p-2.5 text-center text-[var(--ink-3)]">
              <Film className="w-5 h-5 mx-auto mb-1 opacity-50" />
              <p className="text-[10px]">未生成 · 先生成首帧，再点「生成视频」</p>
            </div>
          )}
        </div>
      </div>

      {/* 首帧大图预览 */}
      {firstKeyframe?.image_url && (
        <ImageModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          imageUrl={firstKeyframe.image_url}
          title={`第 ${index + 1} 镜 · 首帧`}
          description={`${shotSizeLabels[shot.shot_size] || shot.shot_size} · ${cameraLabels[shot.camera_movement] || shot.camera_movement} · ${shot.duration_seconds}s`}
        />
      )}
    </Card>
  );
}
