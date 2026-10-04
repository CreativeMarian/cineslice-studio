// 分镜详情面板（导演台右栏）：选中镜头后在此编辑提示词、角色调度并生成首帧/视频/删除
// 逻辑迁移自原 ShotCard 的编辑表单 + 视频轮询（P0-2/P2-前端2/P1-16 行为保持不变），布局改为 320px 面板
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Image, RefreshCw, Trash2, AlertCircle, Clock, Check, Video, Film,
} from 'lucide-react';
import { Badge, ImageModal, Spinner, Select, Button, Textarea } from '../ui';
import { PromptEditor, PromptToggleButton } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { videoService } from '../../services/videoService';
import { shotService } from '../../services/shotService';
import { promptService } from '../../services/promptService';
import { usePromptEditor } from '../../hooks/usePromptEditor';
import { usePolling } from '../../hooks/usePolling';
import { useShotActions } from './useShotActions';
import { showApiError, getResponseErrorMessage, getApiErrorStatus, getApiErrorMessage } from '../../utils/error';
import { shotSizeLabels, cameraLabels, parseShotCharacterNames, BLOCKING_POSITIONS, BLOCKING_FACINGS } from './shotUtils';
import type { Shot, BlockingItem } from '../../types';
import type { ToastType } from '../../stores/useUIStore';

interface ShotDetailPanelProps {
  shot: Shot;
  /** 全局镜头序号（1 起） */
  index: number;
  showToast: (msg: string, type: ToastType) => void;
  /** 删除成功后回调（父级刷新镜头列表） */
  onDeleted?: () => void;
  /** 关闭面板（取消选中） */
  onClose?: () => void;
}

export function ShotDetailPanel({ shot, index, showToast, onDeleted, onClose }: ShotDetailPanelProps) {
  const { characters: allCharacters, scenes, currentEpisodeId, loadCharacters, loadScenes, autoRunActive } = useProjectStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  // P2-前端2: 视频轮询断网退避（连续失败≥3次降频到30s，≥6次暂停并显示"连接中断，点击重试"）
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);
  const [pollRetryTick, setPollRetryTick] = useState(0);

  // 提示词编辑状态
  const [editingAction, setEditingAction] = useState('');
  const [editingDialogue, setEditingDialogue] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // P0-2: 角色/场景下拉 + 角色调度（blocking）编辑
  const [editingCharacterIds, setEditingCharacterIds] = useState<string[]>([]);
  /** 旧数据中无法匹配到角色列表的名称（保留不丢，保存时原样写回） */
  const [legacyCharacterNames, setLegacyCharacterNames] = useState<string[]>([]);
  const [editingSceneId, setEditingSceneId] = useState('');
  const [editingBlocking, setEditingBlocking] = useState<BlockingItem[]>([]);

  // PromptEditor：关键帧提示词 + 视频提示词（展开时调用预览端点自动填入）
  const kfPe = usePromptEditor(() => promptService.previewKeyframePrompt(shot.id));
  const vidPe = usePromptEditor(() => promptService.previewVideoPrompt(shot.id));

  const {
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
  } = useShotActions(shot, index, showToast, onDeleted);

  // 挂载/切换剧集时无条件加载该集角色/场景列表（下拉选项需要，避免跨集残留旧集数据）
  useEffect(() => {
    if (currentEpisodeId) {
      loadCharacters(currentEpisodeId);
      loadScenes(currentEpisodeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpisodeId]);

  // 镜头变化时初始化编辑态（保留旧数据中匹配不到角色的 legacy 名称）
  useEffect(() => {
    setEditingAction(shot.action_description || '');
    setEditingDialogue(shot.dialogue || '');
    const nameToId = new Map(allCharacters.map((c) => [c.name.trim().toLowerCase(), c.id]));
    const ids: string[] = [];
    const legacy: string[] = [];
    for (const rawName of shot.characters_in_shot || []) {
      const name = String(rawName).trim();
      const id = name ? nameToId.get(name.toLowerCase()) : undefined;
      if (id) {
        if (!ids.includes(id)) ids.push(id);
      } else if (rawName && !legacy.includes(rawName)) {
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
    setVideoProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.id]);

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

  /** 当前镜的场景名 */
  const sceneName = useMemo(
    () => (shot.scene_id ? scenes.find((s) => s.id === shot.scene_id)?.name || '' : ''),
    [shot.scene_id, scenes]
  );

  // 生成中视频轮询（挂载后若存在 processing 视频也会自动续轮询，刷新页面可恢复进度显示）
  // P2-前端2: 轮询 API 传 silent 不自动 toast；连续失败≥3次退避到30s；≥6次暂停并显示"连接中断，点击重试"；状态变化由业务侧主动 showToast
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
      const exists = current.find((v) => v.id === processingVideo.id);
      if (exists && (exists.status !== res.data.status || exists.video_url !== res.data.video_url)) {
        useProjectStore.getState().setVideosForShot(shot.id, current.map((v) => (v.id === processingVideo.id ? res.data! : v)));
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
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [processingVideo, isGeneratingVideo]);

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

  const characters = parseShotCharacterNames(shot);
  const dialogueLine = shot.dialogue
    ? `${characters.length > 0 ? `${characters.join(' / ')}：` : ''}“${shot.dialogue}”`
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* 头部：镜号 + 景别 + 关闭 */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[15px] font-semibold text-[var(--ink-1)] leading-none">
          {String(index + 1).padStart(2, '0')} 镜
        </span>
        <Badge variant="accent" className="text-[11px] px-1.5 py-px">{shotSizeLabels[shot.shot_size] || shot.shot_size}</Badge>
        <span className="text-[11px] text-[var(--ink-3)]">{cameraLabels[shot.camera_movement] || shot.camera_movement}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-2)] transition-colors"
            title="关闭详情"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 首帧预览 */}
      <div className="relative aspect-video rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--panel-2)] flex-shrink-0">
        {firstKeyframe?.image_url ? (
          <img
            src={firstKeyframe.image_url}
            alt={`第${index + 1}镜首帧`}
            className="w-full h-full object-cover cursor-zoom-in"
            onClick={() => setPreviewOpen(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-[var(--ink-3)]">
            {isGeneratingKeyframe ? (
              <>
                <Spinner size="sm" />
                <span className="text-[11px]">首帧生成中</span>
              </>
            ) : (
              <>
                <Image className="w-5 h-5 opacity-50" />
                <span className="text-[11px]">暂无首帧，点击下方「生成首帧」</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* 视频状态区 */}
      <div className="flex-shrink-0">
        {completedVideo?.video_url ? (
          <video
            src={completedVideo.video_url}
            controls
            preload="metadata"
            className="w-full aspect-video rounded-lg bg-black object-contain border border-[var(--border)]"
          />
        ) : processingVideo || isGeneratingVideo ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 text-center">
            {connectionLost ? (
              <>
                <AlertCircle className="w-5 h-5 mx-auto mb-1 text-[var(--danger)]" />
                <p className="text-[11px] text-[var(--danger)]">连接中断，点击重试</p>
                <button
                  type="button"
                  onClick={handleRetryPoll}
                  className="mt-1.5 text-[11px] px-2.5 py-1 rounded border border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
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
                    className="h-full bg-[var(--accent)] rounded-full transition-all duration-1000"
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
          <div className="rounded-lg border border-[var(--danger)]/25 bg-[var(--danger)]/5 p-3 text-center">
            <AlertCircle className="w-5 h-5 mx-auto mb-1 text-[var(--danger)]" />
            <p className="text-[11px] text-[var(--danger)] line-clamp-2">{failedVideo.error_message || '视频生成失败，可点击「生成视频」重试'}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-2)]/50 p-3 text-center text-[var(--ink-3)]">
            <Film className="w-5 h-5 mx-auto mb-1 opacity-50" />
            <p className="text-[10px]">未生成视频 · 先生成首帧，再点「生成视频」</p>
          </div>
        )}
      </div>

      {/* 操作按钮：生成首帧 / 生成视频 / 删首帧 */}
      <div className="grid grid-cols-2 gap-2 flex-shrink-0">
        <Button
          size="sm"
          variant="outline"
          leftIcon={isGeneratingKeyframe ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
          onClick={() => handleGenerateKeyframe(kfPe.customPrompt ?? undefined)}
          isLoading={isGeneratingKeyframe}
          disabled={autoRunActive}
        >
          {firstKeyframe ? '重新生成首帧' : '生成首帧'}
        </Button>
        <Button
          size="sm"
          leftIcon={processingVideo || isGeneratingVideo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
          onClick={() => handleGenerateVideo(vidPe.customPrompt ?? undefined)}
          isLoading={isGeneratingVideo}
          disabled={!firstKeyframe || !!processingVideo || isGeneratingVideo || autoRunActive}
          className={completedVideo ? '!bg-[var(--success)]' : ''}
        >
          {processingVideo || isGeneratingVideo ? '生成中' : completedVideo ? '重新生成视频' : '生成视频'}
        </Button>
        {firstKeyframe && (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={handleDeleteKeyframe}
            disabled={autoRunActive}
            className="col-span-2 text-[var(--ink-3)]"
          >
            删除首帧图片（镜头保留，可重新生成）
          </Button>
        )}
      </div>

      {/* 提示词按钮：关键帧提示词 / 视频提示词 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <PromptToggleButton active={kfPe.open} onClick={kfPe.toggle} className="flex-1 justify-center" />
        <PromptToggleButton active={vidPe.open} onClick={vidPe.toggle} className="flex-1 justify-center" />
      </div>

      {/* 提示词编辑器：展开后自动填入完整提示词 */}
      {kfPe.open && (
        <PromptEditor
          title="关键帧提示词"
          prompt={kfPe.prompt}
          contextSummary={kfPe.contextSummary}
          isLoading={kfPe.loading}
          expanded={kfPe.open}
          onExpandedChange={kfPe.setOpen}
          onSave={kfPe.save}
          onReset={kfPe.reset}
          className="flex-shrink-0"
        />
      )}
      {vidPe.open && (
        <PromptEditor
          title="视频提示词"
          prompt={vidPe.prompt}
          contextSummary={vidPe.contextSummary}
          isLoading={vidPe.loading}
          expanded={vidPe.open}
          onExpandedChange={vidPe.setOpen}
          onSave={vidPe.save}
          onReset={vidPe.reset}
          className="flex-shrink-0"
        />
      )}

      {/* 编辑区：动作描述 / 台词 / 角色 / 场景 / 角色调度 */}
      <div className="space-y-3.5 flex-shrink-0">
        <div>
          <label className="text-[11px] text-[var(--ink-3)] mb-1 block">动作描述（提示词）</label>
          <Textarea
            value={editingAction}
            onChange={(e) => setEditingAction(e.target.value)}
            rows={3}
            placeholder="输入动作描述..."
          />
        </div>
        <div>
          <label className="text-[11px] text-[var(--ink-3)] mb-1 block">台词（可选）</label>
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
          <label className="text-[11px] text-[var(--ink-3)] mb-1 block">出场角色（多选）</label>
          {allCharacters.length === 0 ? (
            <p className="text-[11px] text-[var(--ink-3)]">暂无角色数据，请先在「角色设定」页生成角色</p>
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
          <label className="text-[11px] text-[var(--ink-3)] mb-1 block">场景（单选）</label>
          <Select value={editingSceneId || 'none'} onValueChange={(v) => setEditingSceneId(v === 'none' ? '' : v)}>
            <Select.Item value="none">未选择场景</Select.Item>
            {scenes.map((s) => (
              <Select.Item key={s.id} value={s.id}>{s.name}</Select.Item>
            ))}
          </Select>
        </div>

        {/* P0-2: 角色调度（blocking） */}
        <div>
          <label className="text-[11px] text-[var(--ink-3)] mb-1 block">角色调度（位置 / 朝向 / 动作）</label>
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
      </div>

      {/* 底部操作：保存 / 删除 */}
      <div className="flex items-center gap-2 flex-shrink-0 pt-1">
        <Button
          size="md"
          leftIcon={isSavingEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          onClick={handleSaveEdit}
          isLoading={isSavingEdit}
          disabled={autoRunActive}
          className="flex-1"
        >
          保存提示词
        </Button>
        <Button
          size="md"
          variant="danger"
          leftIcon={<Trash2 className="w-4 h-4" />}
          onClick={handleDeleteShot}
          disabled={autoRunActive}
          title="删除整个镜头（连带首帧/视频/音频，不可恢复）"
        >
          删除
        </Button>
      </div>

      {/* 场景/角色信息辅助行 */}
      {(sceneName || parsedBlocking.length > 0) && (
        <div className="text-[10px] text-[var(--ink-3)] flex-shrink-0 space-y-0.5">
          {sceneName && <p>场景：{sceneName}</p>}
          {parsedBlocking.length > 0 && (
            <p className="line-clamp-2">
              调度：{parsedBlocking.map((b) => `${characterNameOf(b.character_id)}(${b.position}/${b.facing})`).join('，')}
            </p>
          )}
        </div>
      )}

      {autoRunActive && (
        <p className="text-[10px] text-[var(--warning)] flex-shrink-0">全自动流水线运行中，手动编辑与生成已禁用</p>
      )}

      {/* 首帧大图预览 */}
      {firstKeyframe?.image_url && (
        <ImageModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          imageUrl={firstKeyframe.image_url}
          title={`第 ${index + 1} 镜 · 首帧`}
          description={`${shotSizeLabels[shot.shot_size] || shot.shot_size} · ${cameraLabels[shot.camera_movement] || shot.camera_movement} · ${shot.duration_seconds}s${dialogueLine ? ` · ${dialogueLine}` : ''}`}
        />
      )}
    </div>
  );
}
