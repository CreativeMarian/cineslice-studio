// 视频参数设置面板（纯展示组件，状态由 ShotCard 管理）
// v1.1 - 增加首尾帧衔接开关（下镜首帧作尾帧，低抽卡核心选项）
import { Video } from 'lucide-react';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import { supportsFLF2V, type VideoModelParamConfig } from '../../config/videoModelConfig';

export type VideoRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
export type VideoResolution = '720p' | '1080p' | '2k' | '4k';

interface VideoParamsPanelProps {
  videoConfig: VideoModelParamConfig;
  selectedVideoModel: string;
  onModelChange: (val: string) => void;
  videoRatio: VideoRatio;
  onRatioChange: (v: VideoRatio) => void;
  videoResolution: VideoResolution;
  onResolutionChange: (v: VideoResolution) => void;
  videoDuration: number;
  onDurationChange: (v: number) => void;
  videoSubtitles: boolean;
  onSubtitlesChange: (v: boolean) => void;
  motionPrompt: string;
  onMotionPromptChange: (v: string) => void;
  useNextFirstFrame: boolean;
  onUseNextFirstFrameChange: (v: boolean) => void;
}

export function VideoParamsPanel({
  videoConfig,
  selectedVideoModel,
  onModelChange,
  videoRatio,
  onRatioChange,
  videoResolution,
  onResolutionChange,
  videoDuration,
  onDurationChange,
  videoSubtitles,
  onSubtitlesChange,
  motionPrompt,
  onMotionPromptChange,
  useNextFirstFrame,
  onUseNextFirstFrameChange,
}: VideoParamsPanelProps) {
  return (
    <div className="mt-3 p-3 bg-[var(--panel-2)] rounded-lg border border-[var(--border)] space-y-3">
      <p className="text-xs font-medium text-[var(--ink-2)]">视频参数设置</p>

      {/* 视频模型选择 — 只显示 video 类型模型 */}
      <div>
        <label className="block text-[10px] text-[var(--ink-3)] mb-1 flex items-center gap-1">
          <Video className="w-3 h-3" /> 选择视频生成模型
        </label>
        <ModelSelector
          modelType="video"
          value={selectedVideoModel}
          onChange={onModelChange}
          placeholder="选择视频模型"
        />
        {supportsFLF2V(selectedVideoModel) && (
          <p className="text-[10px] text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
            🔄 该模型支持首尾帧：先用图片模型生成首/尾帧，起止画面硬锁定，人物/场景/道具一致性更强，视频更符合预期
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">画面比例</label>
          <select
            value={videoRatio}
            onChange={(e) => onRatioChange(e.target.value as VideoRatio)}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
          >
            {videoConfig.ratios.map(r => (
              <option key={r.value} value={r.value}>{r.label}{r.platform ? ` (${r.platform})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">分辨率</label>
          <select
            value={videoResolution}
            onChange={(e) => onResolutionChange(e.target.value as VideoResolution)}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
          >
            {videoConfig.resolutions.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">时长(秒)</label>
          <select
            value={videoDuration}
            onChange={(e) => onDurationChange(Number(e.target.value))}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
          >
            {videoConfig.durations.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        {videoConfig.supportsSubtitles && (
          <div>
            <label className="block text-[10px] text-[var(--ink-3)] mb-1">字幕</label>
            <select
              value={videoSubtitles ? 'yes' : 'no'}
              onChange={(e) => onSubtitlesChange(e.target.value === 'yes')}
              className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="no">不生成</option>
              <option value="yes">生成字幕</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">首尾帧衔接</label>
          <select
            value={useNextFirstFrame ? 'on' : 'off'}
            onChange={(e) => onUseNextFirstFrameChange(e.target.value === 'on')}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="on">开启 · 下镜首帧作尾帧</option>
            <option value="off">关闭 · 仅首帧</option>
          </select>
          <p className="text-[10px] text-[var(--ink-3)] mt-0.5">开启后视频起止画面硬锁定，大幅减少抽卡</p>
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-[var(--ink-3)] mb-1">运动描述（可选）</label>
        <input
          type="text"
          placeholder="描述镜头中的运动，如：镜头缓慢推进"
          value={motionPrompt}
          onChange={(e) => onMotionPromptChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      <p className="text-[10px] text-[var(--ink-3)]">💡 {videoConfig.recommendation}</p>
    </div>
  );
}
