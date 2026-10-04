import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Sparkles,
  Clapperboard,
  Film,
  MessageSquare,
  ChevronDown,
  RefreshCw,
  Clock,
  Mic2,
} from 'lucide-react';
import { Tabs, Button, Card, EmptyState, Badge, Textarea } from '../ui';
import { SectionHeader, EpisodeSelector } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { projectService } from '../../services/projectService';
import { shotService } from '../../services/shotService';
import { useDefaultModels } from '../../hooks/useDefaultModels';
import { showApiError, getResponseErrorMessage } from '../../utils/error';
import { SCRIPT_MAX_LENGTH, SCRIPT_WARN_THRESHOLD } from '../../constants';
import { TIME_OF_DAY_LABELS } from '../../utils';
import type { Episode } from '../../types';

// ---------- 剧本解析（场次 + 节拍流） ----------

interface DialogueBeat {
  type: 'dialogue';
  lineIndex: number;
  name: string;
  text: string;
}

interface ActionBeat {
  type: 'action';
  lineIndex: number;
  text: string;
}

type Beat = DialogueBeat | ActionBeat;

interface ScriptScene {
  id: string;
  title: string;
  lineIndex: number;
  beats: Beat[];
}

/** 将剧本文本解析为场次列表：## 场景头 → 新场次；"角色：台词" → 台词节拍；其余 → 动作节拍 */
function parseScript(content: string): ScriptScene[] {
  const lines = content.split('\n');
  const scenes: ScriptScene[] = [];
  let current: ScriptScene | null = null;
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    if (/^#{1,6}\s+/.test(line) || /^场景\s*[:：]/.test(line) || /^第\s*\d+\s*场/.test(line)) {
      const title = line
        .replace(/^#{1,6}\s+/, '')
        .replace(/^场景\s*[:：]\s*/, '')
        .replace(/^第\s*\d+\s*场\s*[:：]?\s*/, '')
        .trim();
      current = { id: `s${i}`, title: title || '未命名场次', lineIndex: i, beats: [] };
      scenes.push(current);
      return;
    }
    const m = line.match(/^(.+?)\s*[:：]\s*(.*)$/);
    if (m && m[1].trim()) {
      const name = m[1].trim();
      const text = m[2].trim();
      if (!current) {
        current = { id: `s${i}`, title: '开场', lineIndex: i, beats: [] };
        scenes.push(current);
      }
      current.beats.push({ type: 'dialogue', lineIndex: i, name, text });
      return;
    }
    if (!current) {
      current = { id: `s${i}`, title: '开场', lineIndex: i, beats: [] };
      scenes.push(current);
    }
    current.beats.push({ type: 'action', lineIndex: i, text: line });
  });
  return scenes;
}

// ---------- 展示辅助 ----------

const NAME_COLORS = [
  'bg-[rgba(94,140,255,0.15)] text-[var(--color-info)]',
  'bg-[rgba(255,107,90,0.15)] text-[var(--color-danger)]',
  'bg-[rgba(63,203,134,0.15)] text-[var(--color-success)]',
  'bg-[rgba(232,163,61,0.15)] text-[var(--color-warning)]',
  'bg-[var(--accent-soft)] text-[var(--accent)]',
  'bg-[rgba(180,130,255,0.15)] text-purple-500',
];

const VOICE_LABELS: Record<string, string> = {
  zh_female_qingxin: '清新女声',
  zh_female_wener: '温柔女声',
  zh_female_tianmei: '甜美女声',
  zh_female_shenhou: '深厚女声',
  zh_male_qianhou: '浑厚男声',
  zh_male_xiaoshen: '小生男声',
  zh_male_yangguang: '阳光男声',
  zh_male_chenwen: '沉稳男声',
};

/** 台词时长估算：中文口语约 4 字/秒 */
const estimateDuration = (text: string) => Math.max(1, Math.round(text.length / 4));

/** 第 4 段 · 剧本页（场次流 + 台词本，台词 inline 编辑直接对接 TTS） */
export function StageScriptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { episodes, currentEpisodeId, updateEpisode, characters, scenes } = useProjectStore();
  const { showToast } = useUIStore();
  const { getDefaultModel } = useDefaultModels();

  const [content, setContent] = useState('');
  const [view, setView] = useState<'flow' | 'book'>('flow');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGeneratingShots, setIsGeneratingShots] = useState(false);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());

  // 台词 inline 编辑状态
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingText, setEditingText] = useState('');
  const cancelEditRef = useRef(false);

  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId) as Episode | undefined;

  // 切换剧集时同步剧本内容
  useEffect(() => {
    const ep = useProjectStore.getState().episodes.find((e) => e.id === currentEpisodeId);
    if (ep) {
      setContent(ep.script_content || '');
      setExpandedScenes(new Set(parseScript(ep.script_content || '').map((s) => s.id)));
    }
  }, [currentEpisodeId]);

  const scenesData = useMemo(() => parseScript(content), [content]);

  // 角色名首次出现顺序（用于彩色标签）
  const nameOrder = useMemo(() => {
    const order: string[] = [];
    scenesData.forEach((scene) =>
      scene.beats.forEach((beat) => {
        if (beat.type === 'dialogue' && !order.includes(beat.name)) order.push(beat.name);
      })
    );
    return order;
  }, [scenesData]);

  const colorForName = (name: string) => {
    const idx = nameOrder.indexOf(name);
    return NAME_COLORS[idx >= 0 ? idx % NAME_COLORS.length : 0];
  };

  // 台词本：按角色聚合
  const dialogueGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Array<{ text: string; lineIndex: number }>>();
    scenesData.forEach((scene) =>
      scene.beats.forEach((beat) => {
        if (beat.type !== 'dialogue') return;
        if (!map.has(beat.name)) {
          map.set(beat.name, []);
          order.push(beat.name);
        }
        map.get(beat.name)!.push({ text: beat.text, lineIndex: beat.lineIndex });
      })
    );
    return order.map((name) => ({ name, lines: map.get(name)! }));
  }, [scenesData]);

  const totalDialogueCount = dialogueGroups.reduce((sum, g) => sum + g.lines.length, 0);
  const totalDialogueSeconds = dialogueGroups.reduce(
    (sum, g) => sum + g.lines.reduce((s, l) => s + estimateDuration(l.text), 0),
    0
  );

  // 保存剧本内容到后端 + store
  const saveContent = async (newContent: string) => {
    if (!currentEpisode) return;
    try {
      const res = await projectService.updateEpisode(currentEpisode.id, { script_content: newContent });
      if (res.success && res.data) {
        updateEpisode(currentEpisode.id, {
          script_content: newContent,
          status: 'edited',
          word_count: res.data.word_count,
        });
        setContent(newContent);
        showToast('台词已更新并保存', 'success');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '保存失败');
    }
  };

  // 台词 inline 编辑
  const startEdit = (lineIndex: number, name: string, text: string) => {
    cancelEditRef.current = false;
    setEditingLine(lineIndex);
    setEditingName(name);
    setEditingText(text);
  };

  const commitEdit = async () => {
    if (editingLine === null) return;
    if (cancelEditRef.current) {
      setEditingLine(null);
      return;
    }
    const newContent = content
      .split('\n')
      .map((line, i) => (i === editingLine ? `${editingName}：${editingText}` : line))
      .join('\n');
    setEditingLine(null);
    if (newContent === content) return;
    await saveContent(newContent);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEditRef.current = true;
      setEditingLine(null);
    }
  };

  // 重新生成剧本（AI）：直接用默认文本模型
  const handleRegenerate = async () => {
    if (!currentEpisode) return;
    if (!window.confirm('将使用默认文本模型重新生成当前集剧本，当前内容将被覆盖。确定继续？')) return;
    const modelKey = getDefaultModel('text');
    if (!modelKey) {
      showToast('请先在设置中配置默认文本模型', 'error');
      return;
    }
    setIsRegenerating(true);
    try {
      const res = await projectService.regenerateEpisode(currentEpisode.id, { text_model: modelKey });
      if (res.success && res.data) {
        const newContent = res.data.script_content;
        setContent(newContent);
        setExpandedScenes(new Set(parseScript(newContent).map((s) => s.id)));
        updateEpisode(currentEpisode.id, {
          script_content: newContent,
          word_count: res.data.word_count,
          status: 'generated',
        });
        showToast('剧本已重新生成', 'success');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '重新生成失败');
    } finally {
      setIsRegenerating(false);
    }
  };

  // 确认并进入导演台：自动生成分镜，成功后跳转
  const handleConfirm = async () => {
    if (!currentEpisode) return;
    // P2-前端3: 空剧本禁止进入导演台
    if (!hasScript) {
      showToast('请先编写或生成剧本', 'warning');
      return;
    }
    const modelKey = getDefaultModel('text');
    if (!modelKey) {
      showToast('请先在模型配置中添加文本模型', 'error');
      return;
    }
    const [provider, modelName] = modelKey.split(':');
    if (!provider || !modelName) {
      showToast('文本模型配置无效', 'error');
      return;
    }
    setIsGeneratingShots(true);
    try {
      const res = await shotService.generate(currentEpisode.id, {
        textProvider: provider,
        textModel: modelName,
        shotDensity: 'normal',
        includeDialogue: true,
      });
      if (res.success && res.data) {
        showToast(`已生成 ${res.data.length} 个分镜，进入导演台`, 'success');
        navigate(`/project/${id}/director`);
      } else {
        showToast(getResponseErrorMessage(res, '分镜生成失败'), 'error');
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '分镜生成失败');
    } finally {
      setIsGeneratingShots(false);
    }
  };

  // 角色音色档案展示
  const voiceProfileOf = (name: string): { label: string; raw: string } | null => {
    const ch = characters.find((c) => c.name === name);
    if (!ch?.voice_profile) return null;
    try {
      const p = JSON.parse(ch.voice_profile);
      if (!p?.voice) return null;
      const label = VOICE_LABELS[p.voice] || p.voice;
      return { label: typeof p.speed === 'number' ? `${label} · ${p.speed}x` : label, raw: ch.voice_profile };
    } catch {
      return null;
    }
  };

  /** P1-24: 台词 inline 编辑提示行（含全文字数统计，接近 200000 上限时显示警告色） */
  const renderEditHint = () => (
    <p className="text-[10px] text-[var(--ink-3)] mt-1 flex items-center gap-3 flex-wrap">
      <span>Ctrl+Enter 保存 · Esc 取消</span>
      <span className={content.length > SCRIPT_WARN_THRESHOLD ? 'text-[var(--color-warning)] font-medium' : ''}>
        剧本 {content.length}/{SCRIPT_MAX_LENGTH} 字
      </span>
    </p>
  );

  const renderDialogueRow = (beat: DialogueBeat) => {
    const isEditing = editingLine === beat.lineIndex;
    return (
      <div key={beat.lineIndex} className="flex items-start gap-2 text-sm">
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-medium ${colorForName(beat.name)}`}>
          {beat.name}
        </span>
        {isEditing ? (
          <div className="flex-1">
            <Textarea
              autoFocus
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
              rows={2}
              maxLength={SCRIPT_MAX_LENGTH}
              className="text-xs"
              placeholder="编辑台词..."
            />
            {renderEditHint()}
          </div>
        ) : (
          <span
            className="text-[var(--ink-1)] leading-relaxed cursor-text hover:bg-[var(--panel-2)] rounded px-1.5 py-0.5 transition-colors"
            onClick={() => startEdit(beat.lineIndex, beat.name, beat.text)}
            title="点击编辑台词"
          >
            {beat.text || '（空台词，点击输入）'}
          </span>
        )}
      </div>
    );
  };

  if (!currentEpisode) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <SectionHeader
          icon={<FileText className="w-5 h-5 text-[var(--accent)]" />}
          title="剧本"
          description="场次节拍流与台词本，台词直接对接TTS"
          actions={<EpisodeSelector />}
        />
        <Card>
          <EmptyState
            icon={<FileText className="w-8 h-8" />}
            title="请先选择一集"
            description="点击上方下拉框选择剧集后，可查看和编辑场次节拍流与台词本"
          />
        </Card>
      </div>
    );
  }

  const hasScript = content.trim().length > 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <SectionHeader
        icon={<FileText className="w-5 h-5 text-[var(--accent)]" />}
        title="剧本"
        description="场次节拍流与台词本，台词直接对接TTS"
        actions={
          <>
            <Button
              size="md"
              variant="outline"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={handleRegenerate}
              isLoading={isRegenerating}
            >
              {isRegenerating ? '生成中...' : '重新生成剧本'}
            </Button>
            <Button
              size="md"
              leftIcon={isGeneratingShots ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
              onClick={handleConfirm}
              disabled={isGeneratingShots || isRegenerating || !hasScript}
            >
              {isGeneratingShots ? '生成分镜中...' : '确认并进入导演台'}
            </Button>
          </>
        }
      />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <EpisodeSelector />
        <div className="flex items-center gap-2">
          <Badge variant="accent">
            {currentEpisode.status === 'edited' ? '已编辑' : '已生成'}
          </Badge>
          <Badge variant="default">
            <Clock className="w-3 h-3 mr-1" />
            {currentEpisode.word_count || 0} 字
          </Badge>
          {currentEpisode.chapter_range && (
            <Badge variant="default">{currentEpisode.chapter_range}</Badge>
          )}
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as 'flow' | 'book')} defaultValue="flow">
        <Tabs.List>
          <Tabs.Trigger value="flow">
            <Film className="w-4 h-4 mr-2" /> 场次流
            <span className="ml-2 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">
              {scenesData.length}
            </span>
          </Tabs.Trigger>
          <Tabs.Trigger value="book">
            <MessageSquare className="w-4 h-4 mr-2" /> 台词本
            <span className="ml-2 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">
              {totalDialogueCount}
            </span>
          </Tabs.Trigger>
        </Tabs.List>

        {/* 场次流视图 */}
        <Tabs.Content value="flow">
          {!hasScript ? (
            <Card>
              <EmptyState
                icon={<FileText className="w-8 h-8" />}
                title="还没有剧本"
                description="点击右上角「重新生成剧本」让 AI 生成当前集剧本，或等待大纲阶段完成后自动生成"
                action={
                  <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={handleRegenerate} isLoading={isRegenerating}>
                    重新生成剧本
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {scenesData.map((scene) => {
                const isExpanded = expandedScenes.has(scene.id);
                const matchedScene = scenes.find(
                  (s) => scene.title.includes(s.name) || s.name.includes(scene.title)
                );
                return (
                  <Card key={scene.id} className="overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-[var(--panel-2)]/50 transition-colors"
                      onClick={() =>
                        setExpandedScenes((prev) => {
                          const next = new Set(prev);
                          if (next.has(scene.id)) next.delete(scene.id);
                          else next.add(scene.id);
                          return next;
                        })
                      }
                    >
                      <ChevronDown
                        className={`w-4 h-4 text-[var(--ink-3)] transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                      />
                      <span className="text-sm font-semibold text-[var(--ink-1)] font-[var(--font-display)]">
                        {scene.title}
                      </span>
                      {matchedScene && (
                        <>
                          <Badge variant="default">{matchedScene.location || '未设置地点'}</Badge>
                          <Badge variant="default">
                            {TIME_OF_DAY_LABELS[matchedScene.time_of_day] || matchedScene.time_of_day}
                          </Badge>
                        </>
                      )}
                      <span className="ml-auto text-xs text-[var(--ink-3)] flex-shrink-0">
                        {scene.beats.length} 个节拍
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 pt-2 border-t border-[var(--border)] space-y-2.5">
                        {scene.beats.length === 0 && (
                          <p className="text-xs text-[var(--ink-3)]">本场次暂无内容</p>
                        )}
                        {scene.beats.map((beat) =>
                          beat.type === 'action' ? (
                            <div
                              key={beat.lineIndex}
                              className="flex items-start gap-2 text-sm bg-[var(--panel-2)] rounded-lg px-3 py-2 text-[var(--ink-2)] leading-relaxed"
                            >
                              <span className="flex-shrink-0">🎬</span>
                              <span>{beat.text}</span>
                            </div>
                          ) : (
                            renderDialogueRow(beat)
                          )
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs.Content>

        {/* 台词本视图 */}
        <Tabs.Content value="book">
          {!hasScript ? (
            <Card>
              <EmptyState
                icon={<MessageSquare className="w-8 h-8" />}
                title="还没有台词"
                description="先生成剧本后，台词将按角色聚合展示，可直接对接 TTS"
              />
            </Card>
          ) : dialogueGroups.length === 0 ? (
            <Card>
              <EmptyState
                icon={<MessageSquare className="w-8 h-8" />}
                title="剧本中暂无台词"
                description="当前剧本内容尚未包含「角色：台词」格式的对白，可切换到场次流视图检查"
              />
            </Card>
          ) : (
            <div className="space-y-4">
              {/* TTS 提示 */}
              <Card className="p-4 bg-[var(--accent-soft)]/30 border-l-4 border-l-[var(--accent)]">
                <div className="flex items-start gap-3">
                  <Mic2 className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-[var(--ink-2)]">
                    <p className="font-medium text-[var(--ink-1)]">台词本 · 可直接对接 TTS</p>
                    <p className="mt-1">
                      台词已按角色聚合，将使用该角色在「角色设定」中配置的音色档案合成配音；
                      每句台词附时长估算，便于后续导演台分镜时长规划。
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex items-center gap-2">
                <Badge variant="accent">{dialogueGroups.length} 个角色</Badge>
                <Badge variant="default">{totalDialogueCount} 句台词</Badge>
                <Badge variant="default">
                  <Clock className="w-3 h-3 mr-1" /> 约 {totalDialogueSeconds}s
                </Badge>
              </div>

              {dialogueGroups.map((group) => {
                const voice = voiceProfileOf(group.name);
                return (
                  <Card key={group.name} className="overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center gap-3 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-md text-sm font-medium ${colorForName(group.name)}`}>
                        {group.name}
                      </span>
                      <Badge variant="default">{group.lines.length} 句</Badge>
                      {voice ? (
                        <Badge variant="info" className="flex items-center gap-1">
                          <Mic2 className="w-3 h-3" /> {voice.label}
                        </Badge>
                      ) : (
                        <Badge variant="warning">未设置音色档案（将自动分配）</Badge>
                      )}
                    </div>
                    <div className="px-5 py-4 space-y-2">
                      {group.lines.map((line, seq) => {
                        const isEditing = editingLine === line.lineIndex;
                        const seconds = estimateDuration(line.text);
                        return (
                          <div key={line.lineIndex} className="flex items-start gap-3 text-sm">
                            <span className="text-xs text-[var(--ink-3)] font-mono mt-0.5 flex-shrink-0 w-6 text-right">
                              {seq + 1}.
                            </span>
                            {isEditing ? (
                              <div className="flex-1">
                                <Textarea
                                  autoFocus
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={handleEditKeyDown}
                                  rows={2}
                                  maxLength={SCRIPT_MAX_LENGTH}
                                  className="text-xs"
                                  placeholder="编辑台词..."
                                />
                                {renderEditHint()}
                              </div>
                            ) : (
                              <span
                                className="flex-1 text-[var(--ink-1)] leading-relaxed cursor-text hover:bg-[var(--panel-2)] rounded px-1.5 py-0.5 transition-colors"
                                onClick={() => startEdit(line.lineIndex, group.name, line.text)}
                                title="点击编辑台词"
                              >
                                {line.text || '（空台词，点击输入）'}
                              </span>
                            )}
                            <Badge variant="default" className="flex-shrink-0">
                              <Clock className="w-3 h-3 mr-1" /> ~{seconds}s
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
