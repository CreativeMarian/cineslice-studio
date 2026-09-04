// 图生视频 Tab：首帧图（必选）+ 尾帧/参考图（可选）→ 视频
// 支持首尾帧插值：首帧→尾帧的镜头运动，一致性最强
import { useState, useCallback, useMemo } from 'react';
import { Clapperboard, Wand2 } from 'lucide-react';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import { Button } from '../ui';
import { createService, type VideoGenResult, type VideoRatio, type VideoResolution } from '../../services/createService';
import { parseModelKey } from '../../types/model';
import { VIDEO_MODEL_CONFIGS } from '../../config/videoModelConfig';
import { ImageReferencePicker } from './ImageReferencePicker';
import { VideoResultCard } from './VideoResultCard';
import type { GalleryImage } from './CreateStudio';

interface VideoFromImageTabProps {
  onVideoGenerated: (task: VideoGenResult, provider: string, modelName: string) => void;
  gallery: GalleryImage[];
}

export function VideoFromImageTab({ onVideoGenerated, gallery }: VideoFromImageTabProps) {
  const [modelKey, setModelKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [firstFrame, setFirstFrame] = useState<string[]>([]);
  const [lastFrame, setLastFrame] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [ratio, setRatio] = useState<VideoRatio>('16:9');
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [duration, setDuration] = useState(5);
  const [subtitles, setSubtitles] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentTask, setCurrentTask] = useState<VideoGenResult | null>(null);

  const { provider, modelName } = useMemo(() => (modelKey ? parseModelKey(modelKey) : { provider: '', modelName: '' }), [modelKey]);
  const videoConfig = modelKey ? VIDEO_MODEL_CONFIGS[modelKey] : undefined;

  const handleGenerate = useCallback(async () => {
    if (!modelKey || !prompt.trim() || firstFrame.length === 0) return;
    setGenerating(true);
    setCurrentTask(null);
    try {
      const res = await createService.generateVideoFromImage({
        provider,
        modelName,
        prompt: prompt.trim(),
        ratio,
        resolution,
        duration,
        subtitles,
        firstFrameImageUrl: firstFrame[0],
        lastFrameImageUrl: lastFrame[0] || undefined,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      });
      if (res.data) {
        setCurrentTask(res.data);
        onVideoGenerated(res.data, provider, modelName);
      }
    } finally {
      setGenerating(false);
    }
  }, [modelKey, provider, modelName, prompt, ratio, resolution, duration, subtitles, firstFrame, lastFrame, referenceImages, onVideoGenerated]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,460px)_1fr] gap-6">
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1 flex items-center gap-1">
            <Clapperboard className="w-3 h-3" /> 视频生成模型
          </label>
          <ModelSelector modelType="video" value={modelKey} onChange={setModelKey} />
        </div>

        <ImageReferencePicker
          label="首帧图（必选，最多 1 张）"
          value={firstFrame}
          onChange={(urls) => setFirstFrame(urls.slice(0, 1))}
          max={1}
          gallery={gallery}
          hint="视频由此画面开始"
        />

        <ImageReferencePicker
          label="尾帧图（可选）"
          value={lastFrame}
          onChange={(urls) => setLastFrame(urls.slice(0, 1))}
          max={1}
          gallery={gallery}
          hint="提供后生成首尾帧运动过渡，连贯性更强"
        />

        <ImageReferencePicker
          label="角色/风格参考图（可选）"
          value={referenceImages}
          onChange={setReferenceImages}
          max={3}
          gallery={gallery}
          hint="约束人物形象或画面风格"
        />

        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">运动描述（Prompt）</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="描述镜头运动、人物动作、环境变化…（画面主体由首帧决定）"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)] resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-[var(--ink-3)] mb-1">画面比例</label>
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value as VideoRatio)}
              className="w-full px-2 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
            >
              {(videoConfig?.ratios || [{ value: '16:9', label: '横屏 16:9' }, { value: '9:16', label: '竖屏 9:16' }, { value: '1:1', label: '方形 1:1' }]).map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-[var(--ink-3)] mb-1">分辨率</label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as VideoResolution)}
              className="w-full px-2 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
            >
              {(videoConfig?.resolutions || [{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }]).map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-[var(--ink-3)] mb-1">时长（秒）</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full px-2 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
            >
              {(videoConfig?.durations || [{ value: 5, label: '5秒' }, { value: 10, label: '10秒' }]).map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          {(videoConfig?.supportsSubtitles || !videoConfig) && (
            <div>
              <label className="block text-[10px] text-[var(--ink-3)] mb-1">字幕</label>
              <select
                value={subtitles ? 'yes' : 'no'}
                onChange={(e) => setSubtitles(e.target.value === 'yes')}
                className="w-full px-2 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="no">不生成</option>
                <option value="yes">生成字幕</option>
              </select>
            </div>
          )}
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating || !modelKey || !prompt.trim() || firstFrame.length === 0}
          className="w-full"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              提交中…
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" /> 生成视频
            </>
          )}
        </Button>
      </div>

      {/* 右侧：结果 / 说明 */}
      <div className="space-y-4">
        {currentTask && (
          <div>
            <p className="text-xs font-medium text-[var(--ink-2)] mb-2">生成结果</p>
            <VideoResultCard
              task={currentTask}
              provider={provider}
              modelName={modelName}
              onStatusChange={setCurrentTask}
            />
          </div>
        )}
        {!currentTask && (
          <div className="p-5 rounded-xl bg-[var(--panel-2)] border border-[var(--border)] space-y-3">
            <p className="text-sm font-semibold text-[var(--ink-1)]">图生视频（首尾帧插值）</p>
            <ul className="text-xs text-[var(--ink-2)] space-y-2 leading-relaxed">
              <li>· <b>只有首帧</b>：画面从这个固定形象开始运动</li>
              <li>· <b>首帧 + 尾帧</b>：生成两个画面间的完整运动过渡——这是短剧"少抽卡"的核心手段，人物从 A 状态自然走到 B 状态</li>
              <li>· 首帧建议用已生成的关键帧 / 角色定妆照，保证人物一致</li>
              <li>· 参考图用于补充约束服装、场景风格</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
