// 文生视频 Tab：文字直接生成视频（Seedance 等模型）
import { useState, useCallback, useMemo } from 'react';
import { Clapperboard, Wand2 } from 'lucide-react';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import { Button } from '../ui';
import { createService, type VideoGenResult, type VideoRatio, type VideoResolution } from '../../services/createService';
import { parseModelKey } from '../../types/model';
import { VIDEO_MODEL_CONFIGS } from '../../config/videoModelConfig';
import { VideoResultCard } from './VideoResultCard';

interface VideoGenTabProps {
  onVideoGenerated: (task: VideoGenResult, provider: string, modelName: string) => void;
}

export function VideoGenTab({ onVideoGenerated }: VideoGenTabProps) {
  const [modelKey, setModelKey] = useState('');
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState<VideoRatio>('16:9');
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [duration, setDuration] = useState(5);
  const [subtitles, setSubtitles] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentTask, setCurrentTask] = useState<VideoGenResult | null>(null);

  const { provider, modelName } = useMemo(() => (modelKey ? parseModelKey(modelKey) : { provider: '', modelName: '' }), [modelKey]);
  const videoConfig = modelKey ? VIDEO_MODEL_CONFIGS[modelKey] : undefined;

  const handleGenerate = useCallback(async () => {
    if (!modelKey || !prompt.trim()) return;
    setGenerating(true);
    setCurrentTask(null);
    try {
      const res = await createService.generateVideo({
        provider,
        modelName,
        prompt: prompt.trim(),
        ratio,
        resolution,
        duration,
        subtitles,
      });
      if (res.data) {
        setCurrentTask(res.data);
        onVideoGenerated(res.data, provider, modelName);
      }
    } finally {
      setGenerating(false);
    }
  }, [modelKey, provider, modelName, prompt, ratio, resolution, duration, subtitles, onVideoGenerated]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-6">
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1 flex items-center gap-1">
            <Clapperboard className="w-3 h-3" /> 视频生成模型
          </label>
          <ModelSelector modelType="video" value={modelKey} onChange={setModelKey} />
        </div>

        <div>
          <label className="block text-[10px] text-[var(--ink-3)] mb-1">视频描述（Prompt）</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="描述画面内容、运镜、人物动作、光线氛围…"
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
          disabled={generating || !modelKey || !prompt.trim()}
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

      {/* 右侧：结果 / 技巧 */}
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
            <p className="text-sm font-semibold text-[var(--ink-1)]">文生视频提示词要点</p>
            <ul className="text-xs text-[var(--ink-2)] space-y-2 leading-relaxed">
              <li>· 结构：<b>主体 + 动作 + 环境 + 运镜 + 氛围</b></li>
              <li>· 运镜词：推近 / 拉远 / 环绕 / 跟随 / 固定机位</li>
              <li>· 示例：「镜头缓慢推近，古装女子在雪中回眸，发丝随风扬起，电影质感，冷色调」</li>
              <li>· 生成为异步任务，完成后自动播放；视频较长时等待更久</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
