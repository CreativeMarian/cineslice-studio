// 分镜卡片（导演台精简版）：首帧缩略图 + 镜头信息 + 3 个操作（生成首帧/生成视频/删除）+ 视频状态
// 数据自含：挂载时加载该镜关键帧与视频列表；生成视频后自动轮询真实进度
// 使用默认参数（模型取批量工具栏记忆的 moo:last_image_model / moo:last_video_model，缺省回退第一个已配置模型）
// P0-2: 编辑态支持角色下拉多选、场景下拉单选、角色调度（blocking）编辑；旧数据无 blocking 时编辑自动创建
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Video, Image, RefreshCw, Trash2, AlertCircle, Clock, Film, Pencil, Check } from 'lucide-react';
import { Card, Badge, ImageModal, Spinner, Select } from '../ui';
import { useModelStore } from '../../stores/useModelStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { videoService, type ShotKeyframe } from '../../services/videoService';
import { shotService } from '../../services/shotService';
import { getVideoModelConfig } from '../../config/videoModelConfig';
import { usePolling } from '../../hooks/usePolling';
import { showApiError, getResponseErrorMessage, getApiErrorStatus, getApiErrorMessage } from '../../utils/error';
import type { Shot, BlockingItem } from '../../types';
import type { ToastType } from '../../stores/useUIStore';
/** 画面位置选项 */
const BLOCKING_POSITIONS = ['画面左侧', '画面中央', '画面右侧', '前景', '背景'];
/** 朝向选项 */
const BLOCKING_FACINGS = ['左', '右', '镜头', '背对镜头'];

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
  const [isGeneratingKeyframe, setIsGeneratingKeyframe] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  // P2-前端2: 视频轮询断网退避（连续失败≥3次降频到30s，≥6次暂停并显示"连接中断，点击重试"）
  const [connectionLost, setConnectionLost] = useState(false);
  const [pollRetryTick, setPollRetryTick] = useState(0);
  // 提示词编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editingAction, setEditingAction] = useState('');
  const [editingDialogue, setEditingDialogue] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // P0-2: 角色/场景下拉 + 角色调度（blocking）编辑
  const { characters: allCharacters, scenes, currentEpisodeId, loadCharacters, loadScenes, keyframesByShot, videosByShot, setKeyframesForShot, setVideosForShot, autoRunActive } = useProjectStore();
  const [editingCharacterIds, setEditingCharacterIds] = useState<string[]>([]);
  /** 旧数据中无法匹配到角色列表的名称（保留不丢，保存时原样写回） */
  const [legacyCharacterNames, setLegacyCharacterNames] = useState<string[]>([]);
  const [editingSceneId, setEditingSceneId] = useState('');
  const [editingBlocking, setEditingBlocking] = useState<BlockingItem[]>([]);

  // 挂载/切换剧集时无条件加载该集角色/场景列表（下拉选项需要，避免跨集残留旧集数据）
  useEffect(() => {
    if (currentEpisodeId) {
      loadCharacters(currentEpisodeId);
      loadScenes(currentEpisodeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpisodeId]);

  /** 当前镜的角色名（用于徽章展示） */
  const characterNameOf = useCallback(
    (id: string) => allCharacters.find((c) => c.id === id)?.name || id,
    [allCharacters]
  );

  /** 展示态：解析 blocking 列表（旧数据无 blocking 时为空，仅按动作描述显示） */
  const parsedBlocking = useMemo(() => {
    if (!shot.blocking) return [] as BlockingItem[];
    try {
      const b = JSON.parse(shot.blocking);
      return Array.isArray(b) ? (b as BlockingItem[]) : [];
    } catch {
      return [] as BlockingItem[];
    }
  }, [shot.blocking]);

  /** 当前镜的场景名（用于徽章展示） */
  const sceneName = useMemo(
    () => (shot.scene_id ? scenes.find((s) => s.id === shot.scene_id)?.name || '' : ''),
    [shot.scene_id, scenes]
  );

  // 挂载时加载模型配置（选择器渲染需要）
  useEffect(() => {
    if (!configs.image || configs.image.length === 0) {
      loadConfigs();
    }
  }, [configs, loadConfigs]);

  // P2-前端1: 关键帧/视频从 store 缓存读取（StageDirectorPage 加载分镜后一次性批量加载全集，本卡不再单独发请求）
  const keyframes = keyframesByShot[shot.id] || [];
  const videos = videosByShot[shot.id] || [];

  const firstKeyframe = keyframes.find(k => k.frame_type === 'first') || keyframes[0];
  const completedVideo = videos.find(v => v.status === 'completed');
  const processingVideo = videos.find(v => v.status === 'processing' || v.status === 'pending' || v.status === 'generating');
  const failedVideo = videos.find(v => v.status === 'failed');

  // 生成中视频轮询（挂载后若存在 processing 视频也会自动续轮询，刷新页面可恢复进度显示）
  // P2-前端2: 轮询 API 传 silent 不自动 toast；连续失败≥3次退避到30s；≥6次暂停并显示"连接中断，点击重试"；状态变化由业务侧主动 showToast
  // 轮询骨架（退避/暂停/清理）由 usePolling 统一管理，本组件只负责单次状态查询与 store 同步
  usePolling({
    enabled: !!processingVideo,
    retryTick: pollRetryTick,
    onPaused: () => setConnectionLost(true),
    pollFn: async () => {
      if (!processingVideo) return;
      const res = await videoService.getStatus(processingVideo.id, { silent: true });
      if (!res.success || !res.data) return; // HTTP 成功但业务失败：不计数，维持正常轮询
      setConnectionLost(false);
      const current = useProjectStore.getState().videosByShot[shot.id] || [];
      const exists = current.find(v => v.id === processingVideo.id);
      if (exists && (exists.status !== res.data.status || exists.video_url !== res.data.video_url)) {
        setVideosForShot(shot.id, current.map(v => v.id === processingVideo.id ? res.data! : v));
      }
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
    },
  });

  // 无生成中视频时重置进度与连接中断状态
  useEffect(() => {
    if (!processingVideo) {
      setVideoProgress(null);
      setConnectionLost(false);
    }
  }, [processingVideo]);

  /** 断网暂停后点击重试：重置失败计数并重启轮询（usePolling 内部会重置计数） */
  const handleRetryPoll = () => {
    setConnectionLost(false);
    setPollRetryTick((t) => t + 1);
  };

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
        referenceSceneId: shot.scene_id || undefined,
        // 角色参考缺省由后端按 characters_in_shot 自动收集（防旧图缓存与角色漂移）
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
        const currentVideos = useProjectStore.getState().videosByShot[shot.id] || [];
        setVideosForShot(shot.id, [...currentVideos, res.data!]);
        setVideoProgress(0);
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
        setKeyframesForShot(shot.id, currentKeyframes.filter(k => k.id !== firstKeyframe.id));
        showToast('首帧已删除，可重新生成', 'success');
      } else {
        showToast('删除失败', 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '删除失败');
    }
  };

  const characters = parseShotCharacterNames(shot);
  const dialogueLine = shot.dialogue
    ? `${characters.length > 0 ? `${characters.join(' / ')}：` : ''}“${shot.dialogue}”`
    : null;

  // 开始编辑提示词（同时初始化角色/场景/角色调度编辑态）
  const handleStartEdit = () => {
    setEditingAction(shot.action_description || '');
    setEditingDialogue(shot.dialogue || '');
    // P2-前端4: 角色名匹配宽松化——trim + 大小写不敏感（后端生成的角色名可能带空格/大小写差异）
    const nameToId = new Map(allCharacters.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const ids: string[] = [];
    const legacy: string[] = [];
    for (const rawName of shot.characters_in_shot || []) {
      const name = String(rawName).trim();
      const id = name ? nameToId.get(name.toLowerCase()) : undefined;
      if (id) {
        if (!ids.includes(id)) ids.push(id);
      } else if (rawName && !legacy.includes(rawName)) {
        // 匹配不到的角色名保留原样（不丢数据）
        legacy.push(rawName);
      }
    }
    setEditingCharacterIds(ids);
    setLegacyCharacterNames(legacy);
    setEditingSceneId(shot.scene_id || '');
    // blocking：有则解析，无则按出场角色自动创建（向后兼容）
    let blocking: BlockingItem[] = [];
    if (shot.blocking) {
      try {
        const b = JSON.parse(shot.blocking);
        if (Array.isArray(b)) blocking = b as BlockingItem[];
      } catch { /* 忽略损坏 JSON */ }
    }
    if (blocking.length === 0) {
      blocking = (shot.characters_in_shot || []).map((rawName) => {
        const name = String(rawName).trim();
        return {
          character_id: name ? nameToId.get(name.toLowerCase()) || rawName : rawName,
          position: '画面中央',
          facing: '镜头',
          action: '',
        };
      });
    }
    setEditingBlocking(blocking);
    setIsEditing(true);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingAction('');
    setEditingDialogue('');
    setEditingCharacterIds([]);
    setLegacyCharacterNames([]);
    setEditingSceneId('');
    setEditingBlocking([]);
  };

  /** 勾选/取消角色：同步更新 blocking 条目 */
  const handleToggleCharacter = (id: string) => {
    const exists = editingCharacterIds.includes(id);
    setEditingCharacterIds((prev) => (exists ? prev.filter((x) => x !== id) : [...prev, id]));
    setEditingBlocking((prev) =>
      exists
        ? prev.filter((b) => b.character_id !== id)
        : [...prev, { character_id: id, position: '画面中央', facing: '镜头', action: '' }]
    );
  };

  /** 更新某角色的调度字段 */
  const handleUpdateBlocking = (characterId: string, patch: Partial<BlockingItem>) => {
    setEditingBlocking((prev) =>
      prev.map((b) => (b.character_id === characterId ? { ...b, ...patch } : b))
    );
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    // P1-16: 全自动流水线运行中禁止手动修改分镜（后端写锁返回 409，前端先行拦截）
    if (autoRunActive) {
      showToast('全自动流水线运行中，请等待完成', 'warning');
      return;
    }
    setIsSavingEdit(true);
    try {
      // 保存后的角色名 = 选中的角色名 + 无法匹配的 legacy 名称（原样保留）
      const selectedNames = editingCharacterIds
        .map((cid) => allCharacters.find((c) => c.id === cid)?.name.trim() || '')
        .filter((n) => n.length > 0);
      const names = [...new Set([...selectedNames, ...legacyCharacterNames])];
      const res = await shotService.update(shot.id, {
        action_description: editingAction.trim(),
        dialogue: editingDialogue.trim(),
        // characters_in_shot 传 JSON 字符串（后端按 JSON 入库并解析回数组，传数组会被展开导致绑定错误）
        characters_in_shot: JSON.stringify(names),
        // scene_id 传 null 清除场景关联（undefined 会被 JSON.stringify 丢弃导致后端保留旧值）
        scene_id: editingSceneId || null,
        blocking: JSON.stringify(editingBlocking),
      });
      if (res.success) {
        showToast(`第 ${index + 1} 镜提示词已更新`, 'success');
        setIsEditing(false);
        // 触发父组件刷新（通过 window 事件）
        window.dispatchEvent(new CustomEvent('shot-updated', { detail: { shotId: shot.id } }));
      } else {
        // P1-16: 后端写锁返回 409 时展示明确提示
        showToast(getResponseErrorMessage(res, '保存失败'), 'error');
      }
    } catch (err: unknown) {
      if (getApiErrorStatus(err) === 409) {
        showToast(getApiErrorMessage(err, '全自动流水线运行中，请等待完成'), 'warning');
      } else {
        showApiError(showToast, err, '保存失败');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

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
            {sceneName && <Badge variant="default">🏞 {sceneName}</Badge>}
            {parsedBlocking.length > 0 && (
              <span className="text-[10px] text-[var(--ink-3)]">🎭 {parsedBlocking.length} 角色调度</span>
            )}
            {/* 视频状态徽章 */}
            {!firstKeyframe && <Badge variant="danger">⚠ 缺首帧</Badge>}
            {firstKeyframe && !completedVideo && !processingVideo && !isGeneratingVideo && (
              <Badge variant="warning">⏳ 待生成视频</Badge>
            )}
            {processingVideo && <Badge variant="info">🎬 视频生成中</Badge>}
            {completedVideo && <Badge variant="success">✓ 视频已完成</Badge>}
            {failedVideo && !processingVideo && <Badge variant="danger">✗ 视频失败</Badge>}
          </div>
          {/* 提示词区域：非编辑态显示文本+编辑按钮，编辑态显示表单 */}
          {!isEditing ? (
            <>
              <div className="flex items-start gap-1.5">
                <p className="text-sm text-[var(--ink-1)] line-clamp-2 flex-1">{shot.action_description}</p>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="flex-shrink-0 p-1 rounded text-[var(--ink-3)] hover:text-[var(--accent)] hover:bg-[var(--panel-2)] transition-colors"
                  title="编辑提示词"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              {dialogueLine && (
                <p className="text-xs text-[var(--ink-3)] line-clamp-1 mt-1">{dialogueLine}</p>
              )}
              {parsedBlocking.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {parsedBlocking.map((b, i) => (
                    <Badge key={`${b.character_id}-${i}`} variant="info" className="text-[10px]">
                      🎭 {characterNameOf(b.character_id)} · {b.position} · {b.facing}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-[var(--ink-3)] mb-0.5 block">动作描述（提示词）</label>
                <textarea
                  value={editingAction}
                  onChange={(e) => setEditingAction(e.target.value)}
                  rows={3}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-sm text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)] resize-y"
                  placeholder="输入动作描述..."
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--ink-3)] mb-0.5 block">台词（可选）</label>
                <input
                  type="text"
                  value={editingDialogue}
                  onChange={(e) => setEditingDialogue(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-sm text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder="输入台词..."
                />
              </div>

              {/* P0-2: 角色多选（来自该集角色列表） */}
              <div>
                <label className="text-[10px] text-[var(--ink-3)] mb-0.5 block">出场角色（多选）</label>
                {allCharacters.length === 0 ? (
                  <p className="text-[10px] text-[var(--ink-3)]">暂无角色数据，请先在「角色设定」页生成角色</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {allCharacters.map((c) => {
                      const checked = editingCharacterIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleToggleCharacter(c.id)}
                          className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                            checked
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                              : 'border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--accent)]/50'
                          }`}
                        >
                          {checked ? '✓ ' : ''}{c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {legacyCharacterNames.length > 0 && (
                  <p className="text-[10px] text-[var(--ink-3)] mt-1">
                    旧数据角色（保留）：{legacyCharacterNames.join('、')}
                  </p>
                )}
              </div>

              {/* P0-2: 场景单选（来自该集场景列表） */}
              <div>
                <label className="text-[10px] text-[var(--ink-3)] mb-0.5 block">场景（单选）</label>
                <Select value={editingSceneId || 'none'} onValueChange={(v) => setEditingSceneId(v === 'none' ? '' : v)}>
                  <Select.Item value="none">未选择场景</Select.Item>
                  {scenes.map((s) => (
                    <Select.Item key={s.id} value={s.id}>{s.name}</Select.Item>
                  ))}
                </Select>
              </div>

              {/* P0-2: 角色调度（blocking） */}
              <div>
                <label className="text-[10px] text-[var(--ink-3)] mb-0.5 block">角色调度（位置 / 朝向 / 动作）</label>
                {editingBlocking.length === 0 ? (
                  <p className="text-[10px] text-[var(--ink-3)]">勾选上方角色后，可在此设置其在画面中的位置、朝向与动作</p>
                ) : (
                  <div className="space-y-1.5">
                    {editingBlocking.map((b) => (
                      <div key={b.character_id} className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-[var(--ink-1)] font-medium min-w-[56px] truncate">
                          {characterNameOf(b.character_id)}
                        </span>
                        <select
                          value={b.position}
                          onChange={(e) => handleUpdateBlocking(b.character_id, { position: e.target.value })}
                          className="h-7 px-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-[11px] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
                        >
                          {BLOCKING_POSITIONS.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <select
                          value={b.facing}
                          onChange={(e) => handleUpdateBlocking(b.character_id, { facing: e.target.value })}
                          className="h-7 px-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-[11px] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
                        >
                          {BLOCKING_FACINGS.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={b.action}
                          onChange={(e) => handleUpdateBlocking(b.character_id, { action: e.target.value })}
                          placeholder="动作描述（如：拿起桌上的手机）"
                          className="flex-1 min-w-[140px] h-7 px-2 rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-[11px] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit || autoRunActive}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[var(--accent)] text-white hover:brightness-110 disabled:opacity-50 transition-colors"
                >
                  {isSavingEdit ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  保存
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSavingEdit}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-[var(--ink-3)] hover:bg-[var(--panel-2)] disabled:opacity-50 transition-colors"
                >
                  取消
                </button>
                {/* P1-16: autoPipeline 运行中提示，保存按钮已禁用 */}
                <span className={`text-[10px] ml-auto ${autoRunActive ? 'text-[var(--color-warning)] font-medium' : 'text-[var(--ink-3)]'}`}>
                  {autoRunActive ? '全自动流水线运行中，请等待完成' : '保存后重新生成首帧/视频生效'}
                </span>
              </div>
            </div>
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
              {connectionLost ? (
                <>
                  <AlertCircle className="w-5 h-5 mx-auto mb-1 text-red-500" />
                  <p className="text-[10px] text-red-500">连接中断，点击重试</p>
                  <button
                    type="button"
                    onClick={handleRetryPoll}
                    className="mt-1.5 text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    重试
                  </button>
                </>
              ) : (
                <>
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
                </>
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
