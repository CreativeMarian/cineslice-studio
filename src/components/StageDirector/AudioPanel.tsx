import { useState, useEffect } from 'react';
import { Mic, Music, Volume2, Sparkles } from 'lucide-react';
import { Card, Button } from '../ui';
import { ModelSelector } from '../ModelConfig/ModelSelector';
import apiClient from '../../services/apiClient';
import type { Shot } from '../../types';

interface AudioPanelProps {
  episodeId: string;
  shots: Shot[];
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface TtsResult {
  shotId: string;
  shotNumber: number;
  audioUrl?: string;
  fileName?: string;
  error?: string;
}

interface AudioRecord {
  id: string;
  shotId: string;
  shotNumber: number | null;
  fileName: string | null;
  url: string | null;
  voice: string | null;
  speed: number | null;
  durationSeconds: number | null;
  source: string;
  status: string;
  size: number;
  createdAt: string;
}

export function AudioPanel({ episodeId, shots, showToast }: AudioPanelProps) {
  const [ttsModel, setTtsModel] = useState('');
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [ttsResults, setTtsResults] = useState<TtsResult[]>([]);
  const [bgmPreset, setBgmPreset] = useState<'tense' | 'emotional' | 'cheerful' | 'suspense'>('emotional');
  const [bgmVolume, setBgmVolume] = useState(0.25);
  const [isComposing, setIsComposing] = useState(false);
  const [composedAudio, setComposedAudio] = useState<{ url: string; duration: number } | null>(null);
  // 结构化配音记录（v3.0）：刷新后仍可恢复"已配音镜头 + 合成音轨"
  const [audioRecords, setAudioRecords] = useState<AudioRecord[]>([]);

  useEffect(() => {
    apiClient.get<any, any>(`/episodes/${episodeId}/audio`).then((res: any) => {
      if (res.success && res.data) {
        setAudioRecords(res.data.items || []);
      }
    }).catch(() => {});
  }, [episodeId]);

  const handleGenerateTTS = async () => {
    if (!ttsModel) {
      showToast('请选择音频模型', 'error');
      return;
    }
    setIsGeneratingTTS(true);
    try {
      const [provider, modelName] = ttsModel.split(':');
      const res = await apiClient.post<any, any>(`/episodes/${episodeId}/tts`, { provider, modelName });
      if (res.success && res.data) {
        setTtsResults(res.data);
        const successCount = res.data.filter((r: TtsResult) => r.audioUrl).length;
        showToast(`配音生成完成：${successCount} 个镜头。下一步：点击「音频合成」合并音轨`, 'success');
        // 刷新结构化记录
        const audioRes = await apiClient.get<any, any>(`/episodes/${episodeId}/audio`);
        if (audioRes.success && audioRes.data) setAudioRecords(audioRes.data.items || []);
      }
    } catch {
      showToast('配音生成失败', 'error');
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  const handleCompose = async () => {
    // v3.0：从结构化记录取音轨（刷新后仍可合成），优先本次生成结果
    const records = ttsResults.length > 0 ? ttsResults : audioRecords;
    const voiceTracks = records
      .filter((r: any) => r.fileName && (r.audioUrl || r.url))
      .map((r: any) => ({ fileName: r.fileName, shotNumber: r.shotNumber }));
    if (voiceTracks.length === 0) {
      showToast('请先生成配音', 'error');
      return;
    }
    setIsComposing(true);
    try {
      const res = await apiClient.post<any, any>(`/episodes/${episodeId}/audio-compose`, {
        voiceTracks,
        bgmPreset,
        bgmVolume,
      });
      if (res.success && res.data) {
        setComposedAudio({ url: res.data.data.audioUrl, duration: res.data.data.totalDuration });
        showToast('音频合成完成。下一步：进入「导出」阶段合成成片', 'success');
      }
    } catch {
      showToast('音频合成失败', 'error');
    } finally {
      setIsComposing(false);
    }
  };

  const dialogueShots = shots.filter(s => s.dialogue && s.dialogue.trim().length > 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--ink-1)] flex items-center gap-2 mb-3">
          <Mic className="w-4 h-4 text-[var(--accent)]" /> 配音生成（TTS）
        </h3>
        <p className="text-xs text-[var(--ink-3)] mb-3">
          为 {dialogueShots.length} 个有对话的镜头生成角色配音。不同角色可配置不同音色。
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-[var(--ink-3)] mb-1">选择音频生成模型 🎵</label>
            <ModelSelector modelType="audio" value={ttsModel} onChange={setTtsModel} placeholder="选择TTS模型" />
          </div>
          <Button onClick={handleGenerateTTS} isLoading={isGeneratingTTS} leftIcon={<Mic className="w-4 h-4" />}>
            生成配音
          </Button>
        </div>
        {ttsResults.length > 0 && (
          <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            {ttsResults.map(r => (
              <div key={r.shotId} className="flex items-center gap-2 text-xs">
                <span className="text-[var(--ink-3)] w-8">#{r.shotNumber}</span>
                {r.audioUrl ? (
                  <audio src={r.audioUrl} controls className="h-6 flex-1" />
                ) : (
                  <span className="text-red-500 flex-1">生成失败: {r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--ink-1)] flex items-center gap-2 mb-3">
          <Music className="w-4 h-4 text-[var(--accent)]" /> 背景音乐
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">BGM 风格预设</label>
            <select
              value={bgmPreset}
              onChange={(e) => setBgmPreset(e.target.value as any)}
              className="w-full px-2 py-1.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-1)]"
            >
              <option value="tense">紧张</option>
              <option value="emotional">抒情</option>
              <option value="cheerful">欢快</option>
              <option value="suspense">悬疑</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--ink-3)] mb-1">BGM 音量 ({Math.round(bgmVolume * 100)}%)</label>
            <input
              type="range" min={0} max={1} step={0.05}
              value={bgmVolume}
              onChange={(e) => setBgmVolume(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
        <p className="text-xs text-[var(--ink-3)] mt-2">
          音量平衡：配音最响(100%) {'>'} 音效(60%) {'>'} BGM最底({Math.round(bgmVolume * 100)}%)
        </p>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-[var(--ink-1)] flex items-center gap-2 mb-3">
          <Volume2 className="w-4 h-4 text-[var(--accent)]" /> 音频合成
        </h3>
        <p className="text-xs text-[var(--ink-3)] mb-3">
          将配音 + BGM 合成为一条音轨，用于后续视频合成。分镜时长自动对齐配音片段。
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={handleCompose} isLoading={isComposing} leftIcon={<Sparkles className="w-4 h-4" />} disabled={ttsResults.length === 0}>
            合成音轨
          </Button>
          {composedAudio && (
            <div className="flex items-center gap-2">
              <audio src={composedAudio.url} controls className="h-8" />
              <span className="text-xs text-[var(--ink-3)]">{composedAudio.duration}s</span>
            </div>
          )}
        </div>
        {ttsResults.length === 0 && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">⚠️ 请先生成配音，再进行音频合成</p>
        )}
      </Card>

      {audioRecords.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[var(--ink-1)] mb-2">
            已配音镜头（{audioRecords.filter(r => r.url).length} 个）
          </h3>
          <p className="text-xs text-[var(--ink-3)] mb-3">记录已结构化入库，刷新页面不丢失，可直接用于音频合成。</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {audioRecords.map(r => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span className="text-[var(--ink-3)] w-10">#{r.shotNumber ?? '?'}</span>
                {r.url ? (
                  <>
                    <audio src={r.url} controls className="h-6 flex-1" />
                    <span className="text-[var(--ink-3)] whitespace-nowrap">{r.voice || 'edge'}</span>
                  </>
                ) : (
                  <span className="text-red-500 flex-1">文件缺失</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
