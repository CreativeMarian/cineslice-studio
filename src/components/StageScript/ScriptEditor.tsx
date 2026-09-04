import { useState, useEffect, useCallback } from 'react';
import { Edit3, Eye, Save, RefreshCw, FileText, Clock, Check, Wand2, Volume2 } from 'lucide-react';
import { Button, Card, EmptyState, Badge } from '../ui';
import { ConfigPanel } from './ConfigPanel';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { projectService } from '../../services/projectService';
import { audioService, getVoicesForModel, getDefaultVoiceForProvider } from '../../services/audioService';
import { useDebouncedCallback } from '../../hooks/useDebounce';

export function ScriptEditor() {
  const { episodes, currentEpisodeId, updateEpisode } = useProjectStore();
  const { showToast } = useUIStore();
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [polishOpen, setPolishOpen] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [ttsOpen, setTtsOpen] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsVoice, setTtsVoice] = useState('alloy');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsModelKey, setTtsModelKey] = useState(() => {
    try { return localStorage.getItem('moo:last_tts_model') || ''; } catch { return ''; }
  });

  // 切换 TTS 模型时自动切换到对应提供商的默认音色
  const handleTtsModelChange = (modelKey: string) => {
    if (!modelKey) return;
    const provider = modelKey.split(':')[0];
    const defaultVoice = getDefaultVoiceForProvider(provider);
    setTtsVoice(defaultVoice);
    try { localStorage.setItem('moo:last_tts_model', modelKey); } catch { /* ignore */ }
  };

  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId);

  // 只在切换剧集时同步内容。依赖里不能放 currentEpisode 对象：
  // 自动保存完成会更新 episodes 数组、生成新的 currentEpisode 引用，
  // effect 随之重跑会把编辑期间用户继续键入的内容回滚成保存时刻的快照（丢字）
  useEffect(() => {
    const episode = useProjectStore.getState().episodes.find((e) => e.id === currentEpisodeId);
    if (episode) {
      setContent(episode.script_content || '');
      setIsSaved(true);
    }
  }, [currentEpisodeId]);

  const handleSave = useCallback(async () => {
    if (!currentEpisode) return;
    setIsSaving(true);
    try {
      const res = await projectService.updateEpisode(currentEpisode.id, {
        script_content: content,
      });
      if (res.success && res.data) {
        updateEpisode(currentEpisode.id, { script_content: content, status: 'edited', word_count: res.data.word_count });
        setIsSaved(true);
      }
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [currentEpisode, content, updateEpisode, showToast]);

  const debouncedSave = useDebouncedCallback(handleSave, 2000);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsSaved(false);
    debouncedSave();
  };

  const handleRegenerate = async (params: { modelKey: string }) => {
    if (!currentEpisode) return;
    setIsRegenerating(true);
    try {
      const res = await projectService.regenerateEpisode(currentEpisode.id, {
        text_model: params.modelKey,
      });
      if (res.success && res.data) {
        setContent(res.data.script_content);
        updateEpisode(currentEpisode.id, {
          script_content: res.data.script_content,
          word_count: res.data.word_count,
          status: 'generated',
        });
        setIsSaved(true);
        showToast('剧本已重新生成', 'success');
        setRegenerateOpen(false);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '重新生成失败';
      showToast(`重新生成失败: ${errorMsg}`, 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  // 润色剧本（不改变剧情，只优化文字）
  const handlePolish = async (params: { modelKey: string }) => {
    if (!currentEpisode) return;
    setIsPolishing(true);
    try {
      const res = await projectService.polishEpisode(currentEpisode.id, {
        text_model: params.modelKey,
      });
      if (res.success && res.data) {
        setContent(res.data.script_content);
        updateEpisode(currentEpisode.id, {
          script_content: res.data.script_content,
          word_count: res.data.word_count,
          status: 'edited',
        });
        setIsSaved(true);
        showToast('剧本已润色完成', 'success');
        setPolishOpen(false);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '润色失败';
      showToast(`润色失败: ${errorMsg}`, 'error');
    } finally {
      setIsPolishing(false);
    }
  };

  // 为当前集剧本生成配音
  const handleGenerateTTS = async (params: { modelKey: string }) => {
    if (!currentEpisode) return;
    setIsGeneratingAudio(true);
    setAudioUrl(null);
    // 记忆上次选择的模型
    setTtsModelKey(params.modelKey);
    try { localStorage.setItem('moo:last_tts_model', params.modelKey); } catch { /* ignore */ }
    try {
      const [provider, modelName] = params.modelKey.split(':');
      const res = await audioService.generateEpisodeTTS(currentEpisode.id, {
        provider,
        modelName,
        voice: ttsVoice,
        speed: ttsSpeed,
      });
      if (res.success && res.data) {
        setAudioUrl(res.data.audioUrl);
        showToast('配音生成成功', 'success');
        setTtsOpen(false);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '配音生成失败';
      showToast(`配音生成失败: ${errorMsg}`, 'error');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // Markdown 预览渲染
  const renderInlineMarkdown = (text: string) => {
    // 处理 **加粗**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-[var(--ink-1)]">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const renderPreview = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('## ')) {
        return (
          <div key={i} className="mt-6 mb-3 pb-2 border-b border-[var(--border)]">
            <h2 className="text-lg font-bold text-[var(--accent)] font-[var(--font-display)]">
              {line.replace('## ', '')}
            </h2>
          </div>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <h1 key={i} className="text-xl font-bold text-[var(--ink-1)] mt-6 mb-3 font-[var(--font-display)]">
            {line.replace('# ', '')}
          </h1>
        );
      }
      if (line.match(/^.+：/)) {
        const [name, ...dialogue] = line.split('：');
        return (
          <div key={i} className="mb-3 pl-4 border-l-2 border-[var(--accent)]/40">
            <span className="font-semibold text-[var(--accent)]">{name}：</span>
            <span className="text-[var(--ink-1)]">{renderInlineMarkdown(dialogue.join('：'))}</span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} className="h-3" />;
      return (
        <p key={i} className="text-[var(--ink-2)] mb-2 leading-relaxed">
          {renderInlineMarkdown(line)}
        </p>
      );
    });
  };

  if (!currentEpisode) {
    return (
      <Card>
        <EmptyState
          icon={<FileText className="w-8 h-8" />}
          title="请先选择一集"
          description="在左侧剧集列表中选择一集来查看和编辑剧本内容"
        />
      </Card>
    );
  }

  // 使用数据库的 word_count 字段，不使用 content.length
  const wordCount = currentEpisode.word_count || 0;

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center">
            <span className="text-sm font-bold text-[var(--on-accent)] font-[var(--font-display)]">
              {String(currentEpisode.episode_number).padStart(2, '0')}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">{currentEpisode.title}</h3>
              <Badge variant={currentEpisode.status === 'edited' ? 'accent' : 'success'}>
                {currentEpisode.status === 'edited' ? '已编辑' : '已生成'}
              </Badge>
              {currentEpisode.chapter_range && (
                <Badge variant="default" className="text-xs">{currentEpisode.chapter_range}</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--ink-3)] mt-0.5">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {wordCount} 字
              </span>
              {isSaving ? (
                <span className="flex items-center gap-1 text-[var(--accent)]">
                  <Save className="w-3 h-3 animate-pulse" /> 保存中...
                </span>
              ) : isSaved ? (
                <span className="flex items-center gap-1 text-[var(--color-success)]">
                  <Check className="w-3 h-3" /> 已保存
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[var(--color-warning)]">
                  <Clock className="w-3 h-3" /> 未保存
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-[var(--radius-control)] border border-[var(--border)] overflow-hidden bg-[var(--panel-2)]">
            <button
              onClick={() => setMode('edit')}
              className={`px-3.5 py-2 text-sm flex items-center gap-1.5 transition-colors ${
                mode === 'edit' ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              }`}
            >
              <Edit3 className="w-4 h-4" /> 编辑
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`px-3.5 py-2 text-sm flex items-center gap-1.5 transition-colors ${
                mode === 'preview' ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              }`}
            >
              <Eye className="w-4 h-4" /> 预览
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={handleSave} isLoading={isSaving}>
            <Save className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Wand2 className="w-4 h-4" />}
            onClick={() => setPolishOpen(true)}
          >
            润色
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RefreshCw className="w-4 h-4" />}
            onClick={() => setRegenerateOpen(true)}
          >
            重新生成
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Volume2 className="w-4 h-4" />}
            onClick={() => setTtsOpen(true)}
          >
            生成配音
          </Button>
        </div>
      </div>

      {/* 编辑区 */}
      <Card className="overflow-hidden">
        {mode === 'edit' ? (
          <textarea
            value={content}
            onChange={handleContentChange}
            className="w-full h-[520px] p-6 bg-transparent text-[var(--ink-1)] font-mono text-sm resize-none focus:outline-none leading-relaxed"
            placeholder={'在此编辑剧本内容...\n\n## 场景：场景名称\n场景描述...\n\n角色名：对话内容'}
            spellCheck={false}
          />
        ) : (
          <div className="h-[520px] overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto">
              {renderPreview(content)}
            </div>
          </div>
        )}
      </Card>

      {/* 音频播放器 */}
      {audioUrl && (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--ink-1)]">剧集配音</div>
              <div className="text-xs text-[var(--ink-3)]">点击播放收听本集配音</div>
            </div>
          </div>
          <audio
            controls
            src={audioUrl}
            className="w-full"
            preload="metadata"
          />
        </Card>
      )}

      {/* 重新生成配置面板 */}
      <ConfigPanel
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        title="重新生成剧本"
        description="将使用选定的文本模型重新生成当前集剧本，当前内容将被覆盖"
        modelType="text"
        onGenerate={handleRegenerate}
        isLoading={isRegenerating}
      />

      {/* 润色配置面板 */}
      <ConfigPanel
        open={polishOpen}
        onOpenChange={setPolishOpen}
        title="润色剧本"
        description="AI 将优化当前集的文字表达，不改变剧情和情节，只优化对话和描写"
        modelType="text"
        onGenerate={handlePolish}
        isLoading={isPolishing}
      />

      {/* 配音配置面板 */}
      <ConfigPanel
        open={ttsOpen}
        onOpenChange={setTtsOpen}
        title="生成配音"
        description="将当前集剧本转为语音，选择音色和语速后开始生成"
        modelType="audio"
        onGenerate={handleGenerateTTS}
        isLoading={isGeneratingAudio}
        defaultModelKey={ttsModelKey}
        onModelChange={handleTtsModelChange}
        extraFields={(modelKey) => {
          const voices = getVoicesForModel(modelKey);
          const currentVoiceValid = voices.some((v) => v.value === ttsVoice);
          const displayVoice = currentVoiceValid ? ttsVoice : (voices[0]?.value || '');
          return (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">
                  音色
                  {modelKey && (
                    <span className="text-xs text-[var(--ink-3)] ml-2">
                      （{voices.length} 个可用）
                    </span>
                  )}
                </label>
                <select
                  value={displayVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--panel-2)] text-[var(--ink-1)] text-sm focus:outline-none focus:border-[var(--accent)]"
                >
                  {voices.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}{v.description ? ` — ${v.description}` : ''}
                    </option>
                  ))}
                </select>
                {!modelKey && (
                  <p className="text-xs text-[var(--ink-3)] mt-1">请先选择音频模型，将自动列出对应音色</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">
                  语速：{ttsSpeed.toFixed(2)}x
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={ttsSpeed}
                  onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
                <div className="flex justify-between text-xs text-[var(--ink-3)] mt-1">
                  <span>0.5x 慢速</span>
                  <span>1.0x 正常</span>
                  <span>2.0x 快速</span>
                </div>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
