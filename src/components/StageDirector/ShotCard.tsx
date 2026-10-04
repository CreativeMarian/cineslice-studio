// 分镜卡片（导演台中栏·紧凑展示版）：镜号 + 时长/景别 Badge + 状态点 + 16:9 首帧图（hover 遮罩：重新生成/放大）
// 点击卡片选中 → 右侧详情面板（ShotDetailPanel）进行编辑与视频生成
// 状态自含：关键帧/视频从 store 缓存读取；生成动作经 useShotActions 共享 Hook，与详情面板逻辑一致
import { useState } from 'react';
import { Image, RefreshCw, Maximize2, MessageSquare, AlertCircle } from 'lucide-react';
import { Card, Badge, ImageModal, Spinner } from '../ui';
import { useProjectStore } from '../../stores/useProjectStore';
import { useShotActions } from './useShotActions';
import { shotSizeLabels, cameraLabels, parseShotCharacterNames } from './shotUtils';
import type { Shot } from '../../types';
import type { ToastType } from '../../stores/useUIStore';

type CardState = 'idle' | 'generating' | 'done' | 'failed';

interface ShotCardProps {
  shot: Shot;
  /** 全局镜头序号（1 起） */
  index: number;
  /** 当前选中态（右侧详情面板联动） */
  selected?: boolean;
  /** 点击卡片：选中该镜并打开右侧详情面板 */
  onSelect?: (shot: Shot) => void;
  showToast: (msg: string, type: ToastType) => void;
}

function StatusDot({ state }: { state: CardState }) {
  const map: Record<CardState, string> = {
    idle: 'bg-[var(--ink-3)]',
    generating: 'bg-[var(--accent)] animate-pulse',
    done: 'bg-[var(--success)]',
    failed: 'bg-[var(--danger)]',
  };
  const title: Record<CardState, string> = {
    idle: '未生成',
    generating: '生成中',
    done: '已完成',
    failed: '失败',
  };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${map[state]}`} title={title[state]} />;
}

export function ShotCard({ shot, index, selected, onSelect, showToast }: ShotCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const autoRunActive = useProjectStore((s) => s.autoRunActive);

  const {
    firstKeyframe,
    completedVideo,
    processingVideo,
    failedVideo,
    isGeneratingKeyframe,
    handleGenerateKeyframe,
    handleGenerateVideo,
  } = useShotActions(shot, index, showToast);

  const characters = parseShotCharacterNames(shot);
  const dialogueLine = shot.dialogue
    ? `${characters.length > 0 ? `${characters.join(' / ')}：` : ''}“${shot.dialogue}”`
    : null;

  // 卡片状态：生成中 > 失败 > 完成 > 未生成
  const cardState: CardState = processingVideo
    ? 'generating'
    : failedVideo && !completedVideo
      ? 'failed'
      : completedVideo
        ? 'done'
        : 'idle';

  const hasImage = !!firstKeyframe?.image_url;

  return (
    <Card
      hover
      className={`group overflow-hidden transition-all ${
        selected
          ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/40'
          : cardState === 'failed'
            ? 'border-[var(--danger)]/40'
            : ''
      }`}
      onClick={onSelect ? () => onSelect(shot) : undefined}
    >
      {/* 顶部行：镜号 + 时长 + 景别 + 运镜 + 状态点 */}
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <span className="font-mono text-[13px] font-semibold text-[var(--ink-1)] leading-none">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="w-px h-3 bg-[var(--border)]" />
        <Badge variant="default" className="text-[11px] px-1.5 py-px leading-none">{shot.duration_seconds}s</Badge>
        <Badge variant="accent" className="text-[11px] px-1.5 py-px leading-none">
          {shotSizeLabels[shot.shot_size] || shot.shot_size}
        </Badge>
        <span className="text-[11px] text-[var(--ink-3)] truncate">
          {cameraLabels[shot.camera_movement] || shot.camera_movement}
        </span>
        <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {autoRunActive && <span className="text-[10px] text-[var(--warning)]">流水线运行中</span>}
          <StatusDot state={cardState} />
        </span>
      </div>

      {/* 中部：16:9 首帧图（未生成=虚线占位；hover 遮罩：重新生成/放大） */}
      <div
        className={`relative mx-3.5 mt-2.5 aspect-video rounded-lg overflow-hidden border bg-[var(--panel-2)] ${
          hasImage ? 'border-[var(--border)]' : 'border-dashed border-[var(--border)]'
        }`}
      >
        {hasImage ? (
          <img
            src={firstKeyframe!.image_url!}
            alt={`第${index + 1}镜首帧`}
            className="w-full h-full object-cover"
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
                <span className="text-[11px]">暂无首帧</span>
              </>
            )}
          </div>
        )}

        {/* 视频生成中遮罩 */}
        {processingVideo && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
            <Spinner size="sm" />
            <span className="text-[11px] text-white/90 flex items-center gap-1.5">
              视频生成中
              <span className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
                <span className="block h-full bg-[var(--accent-2)] rounded-full animate-pulse w-1/2" />
              </span>
            </span>
          </div>
        )}

        {/* 失败遮罩：红色边框 + 重试按钮 */}
        {failedVideo && !processingVideo && !isGeneratingKeyframe && (
          <div className="absolute inset-0 bg-[var(--danger)]/10 flex items-center justify-center backdrop-blur-[1px]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleGenerateVideo();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--danger)] text-white text-[11px] font-medium hover:brightness-110 transition-all"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              重试生成视频
            </button>
          </div>
        )}

        {/* hover 遮罩：重新生成 / 放大（仅已有首帧时） */}
        {hasImage && !processingVideo && (
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleGenerateKeyframe();
              }}
              disabled={isGeneratingKeyframe}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-[11px] font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingKeyframe ? 'animate-spin' : ''}`} />
              重新生成
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-[11px] font-medium transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              放大
            </button>
          </div>
        )}
      </div>

      {/* 底部：动作描述（2行截断）+ 台词图标 */}
      <div className="px-3.5 pt-2.5 pb-3.5">
        <p className="text-[13px] leading-relaxed text-[var(--ink-2)] line-clamp-2 min-h-[2.4em]">
          {shot.action_description}
        </p>
        {dialogueLine && (
          <div className="flex items-start gap-1.5 mt-1.5 text-xs text-[var(--ink-3)]">
            <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0 text-[var(--accent-2)]" />
            <span className="line-clamp-1 flex-1">{dialogueLine}</span>
          </div>
        )}
      </div>

      {/* 首帧大图预览 */}
      {hasImage && (
        <ImageModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          imageUrl={firstKeyframe!.image_url!}
          title={`第 ${index + 1} 镜 · 首帧`}
          description={`${shotSizeLabels[shot.shot_size] || shot.shot_size} · ${cameraLabels[shot.camera_movement] || shot.camera_movement} · ${shot.duration_seconds}s`}
        />
      )}
    </Card>
  );
}
