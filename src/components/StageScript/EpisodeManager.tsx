import { useState, useEffect, useRef } from 'react';
import { Film, Sparkles, ChevronRight, Clock, FileText, Wand2, BookOpen, ArrowRight, AlertTriangle, RefreshCw, Trash2, CheckSquare, Square } from 'lucide-react';
import { Button, Card, EmptyState, Badge, Modal, Select } from '../ui';
import { ConfigPanel } from './ConfigPanel';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { projectService } from '../../services/projectService';
import { formatRelativeTime } from '../../utils';
import type { Episode } from '../../types';

export function EpisodeManager() {
  const { currentProject, episodes, currentEpisodeId, setCurrentEpisode, setEpisodes, selectedChapterIds, chapters, updatePipelineStep, updateEpisode } = useProjectStore();
  const { showToast } = useUIStore();
  const [configOpen, setConfigOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingModel, setGeneratingModel] = useState('');
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generateStage, setGenerateStage] = useState('');
  const [generateElapsed, setGenerateElapsed] = useState(0);
  const [episodesCount, setEpisodesCount] = useState<string>('auto');
  const [customEpisodesCount, setCustomEpisodesCount] = useState<number>(10);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const [pendingGenerateParams, setPendingGenerateParams] = useState<{ modelKey: string } | null>(null);
  const [noChaptersDialogOpen, setNoChaptersDialogOpen] = useState(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 批量选择
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<Set<string>>(new Set());
  // 单集重新生成
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regeneratingEpisodeId, setRegeneratingEpisodeId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [lastEpisodeModel, setLastEpisodeModel] = useState(() => {
    try { return localStorage.getItem('moo:last_episode_model') || ''; } catch { return ''; }
  });

  // 按 episode_number 排序的剧集列表
  const sortedEpisodes = [...episodes].sort((a, b) => a.episode_number - b.episode_number);

  // 生成进度模拟（分阶段）
  useEffect(() => {
    if (isGenerating) {
      setGenerateProgress(5);
      setGenerateStage('正在连接 AI 服务...');
      setGenerateElapsed(0);

      const startTime = Date.now();
      progressTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setGenerateElapsed(elapsed);

        // 分阶段模拟进度
        let progress = 5;
        let stage = '正在连接 AI 服务...';

        if (elapsed >= 2) {
          progress = 15 + Math.min(elapsed - 2, 10) * 3;
          stage = '正在分析小说章节内容...';
        }
        if (elapsed >= 12) {
          progress = 45 + Math.min(elapsed - 12, 20) * 2;
          stage = 'AI 正在改编剧本...';
        }
        if (elapsed >= 32) {
          progress = 85 + Math.min(elapsed - 32, 15) * 1;
          stage = '正在整理生成结果...';
        }
        if (elapsed >= 47) {
          progress = 95;
          stage = '即将完成...';
        }

        setGenerateProgress(Math.min(progress, 95));
        setGenerateStage(stage);
      }, 500);

      return () => {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      };
    }
  }, [isGenerating]);

  const getEpisodesCountValue = (): number | undefined => {
    if (episodesCount === 'auto') return undefined;
    if (episodesCount === 'custom') return customEpisodesCount;
    return parseInt(episodesCount, 10);
  };

  const doGenerate = async (params: { modelKey: string }) => {
    if (!currentProject) return;
    setIsGenerating(true);
    setGeneratingModel(params.modelKey);
    setLastEpisodeModel(params.modelKey);
    try { localStorage.setItem('moo:last_episode_model', params.modelKey); } catch { /* ignore */ }
    setGenerateProgress(5);
    setGenerateStage('正在连接 AI 服务...');
    try {
      const res = await projectService.generateEpisodes(currentProject.id, {
        chapter_ids: selectedChapterIds,
        modelKey: params.modelKey,
        episodes_count: getEpisodesCountValue(),
        style: 'standard',
      });
      if (res.success && res.data) {
        setGenerateProgress(100);
        setGenerateStage('生成完成！');
        // 替换旧剧集列表（后端已删除旧剧集）
        setEpisodes(res.data);
        // 自动选中第一集
        if (res.data.length > 0) {
          setCurrentEpisode(res.data[0].id);
        }
        showToast(`成功生成 ${res.data.length} 集。下一步：点击「编辑剧本」检查润色`, 'success');
        // 停留在剧集管理页，由用户主动进入剧本编辑
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '生成失败，请检查模型配置';
      setGenerateStage(`生成失败: ${errorMsg.length > 80 ? errorMsg.slice(0, 80) + '...' : errorMsg}`);
      showToast(`生成失败: ${errorMsg}`, 'error');
    } finally {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      // 延时重置存入 ref：新一轮生成开始或组件卸载时必须取消，
      // 否则旧回调会打断新任务的 isGenerating/进度 UI
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setIsGenerating(false);
        setGeneratingModel('');
        setGenerateProgress(0);
        setGenerateStage('');
        setGenerateElapsed(0);
      }, 1500);
    }
  };

  const handleGenerate = (params: { modelKey: string }) => {
    if (!currentProject) return;
    if (selectedChapterIds.length === 0) {
      setNoChaptersDialogOpen(true);
      return;
    }
    if (episodes.length > 0) {
      setPendingGenerateParams(params);
      setConfirmOverwriteOpen(true);
      return;
    }
    doGenerate(params);
  };

  const handleConfirmOverwrite = () => {
    setConfirmOverwriteOpen(false);
    if (pendingGenerateParams) {
      doGenerate(pendingGenerateParams);
      setPendingGenerateParams(null);
    }
  };

  // 单集重新生成
  const handleRegenerateEpisode = (episodeId: string) => {
    setRegeneratingEpisodeId(episodeId);
    setRegenerateOpen(true);
  };

  const doRegenerate = async (params: { modelKey: string }) => {
    if (!regeneratingEpisodeId) return;
    setIsRegenerating(true);
    try {
      const res = await projectService.regenerateEpisode(regeneratingEpisodeId, {
        text_model: params.modelKey,
      });
      if (res.success && res.data) {
        updateEpisode(regeneratingEpisodeId, {
          script_content: res.data.script_content,
          title: res.data.title,
          word_count: res.data.word_count,
          status: 'generated',
        });
        showToast('该集已重新生成', 'success');
        setRegenerateOpen(false);
        setRegeneratingEpisodeId(null);
      }
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || '重新生成失败';
      showToast(`重新生成失败: ${errorMsg}`, 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  // 批量选择
  const toggleEpisodeSelect = (episodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEpisodeIds(prev => {
      const next = new Set(prev);
      if (next.has(episodeId)) {
        next.delete(episodeId);
      } else {
        next.add(episodeId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedEpisodeIds.size === sortedEpisodes.length) {
      setSelectedEpisodeIds(new Set());
    } else {
      setSelectedEpisodeIds(new Set(sortedEpisodes.map(e => e.id)));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (!currentProject || selectedEpisodeIds.size === 0) return;
    try {
      await projectService.batchDeleteEpisodes(currentProject.id, Array.from(selectedEpisodeIds));
      const remaining = episodes.filter(e => !selectedEpisodeIds.has(e.id));
      setEpisodes(remaining);
      if (currentEpisodeId && selectedEpisodeIds.has(currentEpisodeId)) {
        setCurrentEpisode(remaining[0]?.id || null);
      }
      showToast(`已删除 ${selectedEpisodeIds.size} 集`, 'success');
      setSelectedEpisodeIds(new Set());
    } catch {
      showToast('批量删除失败', 'error');
    }
  };

  // 单集删除
  const handleDeleteEpisode = async (episodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentProject) return;
    try {
      await projectService.batchDeleteEpisodes(currentProject.id, [episodeId]);
      const remaining = episodes.filter(ep => ep.id !== episodeId);
      setEpisodes(remaining);
      if (currentEpisodeId === episodeId) {
        setCurrentEpisode(remaining[0]?.id || null);
      }
      showToast('已删除该集', 'success');
    } catch {
      showToast('删除失败', 'error');
    }
  };

  const statusConfig: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'accent' }> = {
    draft: { label: '草稿', variant: 'default' },
    generated: { label: '已生成', variant: 'success' },
    edited: { label: '已编辑', variant: 'accent' },
  };

  const selectedChapters = chapters.filter(c => selectedChapterIds.includes(c.id));

  return (
    <div className="space-y-5">
      {/* 已选章节提示 */}
      {selectedChapterIds.length > 0 && (
        <Card className="p-4 bg-[var(--accent-soft)]/50 border-[var(--accent)]/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium text-[var(--ink-1)]">
                  已选择 {selectedChapterIds.length} 个章节
                </p>
                <p className="text-xs text-[var(--ink-3)] truncate max-w-md">
                  {selectedChapters.map(c => c.title).join('、')}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => updatePipelineStep('novel')}>
              重新选择
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
            <Film className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">剧集列表</h3>
            <p className="text-xs text-[var(--ink-3)]">AI 将选定章节改编为剧集剧本</p>
          </div>
          <Badge variant="accent" className="ml-2">{episodes.length} 集</Badge>
        </div>
        <div className="flex items-center gap-2">
          {selectedEpisodeIds.size > 0 && (
            <>
              <span className="text-xs text-[var(--ink-3)]">已选 {selectedEpisodeIds.size} 集</span>
              <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-4 h-4" />} onClick={handleBatchDelete}>
                删除选中
              </Button>
            </>
          )}
          <Button
            size="md"
            leftIcon={<Sparkles className="w-4 h-4" />}
            onClick={() => setConfigOpen(true)}
            disabled={selectedChapterIds.length === 0}
          >
            生成剧集
          </Button>
        </div>
      </div>

      {/* 生成中进度条 */}
      {isGenerating && (
        <Card className="p-4 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[var(--accent)] animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[var(--ink-1)]">{generateStage}</p>
              <p className="text-xs text-[var(--ink-3)]">
                已选择 {selectedChapterIds.length} 个章节 · 已用时 {generateElapsed}s · {generateProgress}%
              </p>
            </div>
            <div className="text-xs text-[var(--ink-3)] bg-[var(--bg-2)] px-2 py-1 rounded">
              {generatingModel || 'AI 模型'}
            </div>
          </div>
          <div className="w-full h-2 bg-[var(--bg-2)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${generateProgress}%` }}
            />
          </div>
        </Card>
      )}

      {episodes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wand2 className="w-8 h-8" />}
            title="还没有剧集"
            description={selectedChapterIds.length === 0
              ? "请先在「小说管理」中选择章节，然后生成剧集剧本"
              : "点击右上角「生成剧集」，AI 将选定章节改编为剧本"}
            action={selectedChapterIds.length === 0 ? (
              <Button leftIcon={<BookOpen className="w-4 h-4" />} onClick={() => updatePipelineStep('novel')}>
                去选择章节
              </Button>
            ) : (
              <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={() => setConfigOpen(true)}>
                开始生成
              </Button>
            )}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {/* 全选工具栏 */}
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
            >
              {selectedEpisodeIds.size === sortedEpisodes.length ? (
                <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              全选
            </button>
          </div>

          {sortedEpisodes.map((episode: Episode) => {
            const status = statusConfig[episode.status] || statusConfig.draft;
            const isActive = currentEpisodeId === episode.id;
            const isSelected = selectedEpisodeIds.has(episode.id);
            return (
              <Card
                key={episode.id}
                hover
                className={`p-4 transition-all ${isActive ? 'border-[var(--accent)] shadow-[var(--shadow-glow)]' : ''} ${isSelected ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)]/20' : ''}`}
                onClick={() => setCurrentEpisode(episode.id)}
              >
                <div className="flex items-center gap-4">
                  {/* 选择框 */}
                  <button
                    onClick={(e) => toggleEpisodeSelect(episode.id, e)}
                    className="flex-shrink-0 text-[var(--ink-3)] hover:text-[var(--accent)] transition-colors"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-[var(--accent)]" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>

                  {/* 集数编号 - 使用 episode_number 而非数组索引 */}
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                    isActive
                      ? 'bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-[0_4px_16px_rgba(43, 116, 245, 0.25)]'
                      : 'bg-[var(--panel-2)] border border-[var(--border)]'
                  }`}>
                    <div className="text-center">
                      <span className={`text-lg font-bold font-[var(--font-display)] ${isActive ? 'text-white' : 'text-[var(--ink-2)]'}`}>
                        {String(episode.episode_number).padStart(2, '0')}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-[var(--ink-1)] truncate">{episode.title}</h4>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {episode.chapter_range && (
                        <Badge variant="default" className="text-xs">{episode.chapter_range}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-[var(--ink-3)] line-clamp-2">
                      {episode.script_content?.slice(0, 120) || '暂无剧本内容'}...
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--ink-3)]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(episode.created_at)}
                      </span>
                      {/* 直接显示数据库的 word_count */}
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {episode.word_count} 字
                      </span>
                      {episode.text_model_used && (
                        <span className="flex items-center gap-1">
                          {episode.text_model_used}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      onClick={() => handleRegenerateEpisode(episode.id)}
                      title="单独重新生成"
                    >
                      重生成
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={(e) => handleDeleteEpisode(episode.id, e)}
                      title="删除该集"
                    />
                  </div>

                  <ArrowRight className="w-5 h-5 text-[var(--ink-3)] flex-shrink-0" />
                </div>
              </Card>
            );
          })}

          {/* 生成后提示去编辑剧本 */}
          {episodes.length > 0 && currentEpisodeId && (
            <div className="sticky bottom-4 z-10">
              <Card className="p-4 flex items-center justify-between shadow-lg border-[var(--accent)]/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                    <FileText className="w-5 h-5 text-[var(--accent)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink-1)]">剧集已生成</p>
                    <p className="text-xs text-[var(--ink-3)]">点击右侧按钮进入剧本编辑</p>
                  </div>
                </div>
                <Button onClick={() => updatePipelineStep('script')}>
                  编辑剧本
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Card>
            </div>
          )}
        </div>
      )}

      <ConfigPanel
        open={configOpen}
        onOpenChange={setConfigOpen}
        title="生成剧集剧本"
        description="AI 将选定的小说章节改编为剧集剧本，包含场景、对话和动作描写"
        modelType="text"
        onGenerate={handleGenerate}
        isLoading={isGenerating}
        defaultModelKey={lastEpisodeModel}
        extraFields={
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">
                集数设置
              </label>
              <Select value={episodesCount} onValueChange={setEpisodesCount}>
                <Select.Item value="auto">自动检测（按原文集数标记）</Select.Item>
                <Select.Item value="5">5 集</Select.Item>
                <Select.Item value="10">10 集</Select.Item>
                <Select.Item value="20">20 集</Select.Item>
                <Select.Item value="custom">自定义</Select.Item>
              </Select>
            </div>
            {episodesCount === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">
                  自定义集数（1-50）
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={customEpisodesCount}
                  onChange={(e) => setCustomEpisodesCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  className="w-full h-10 px-3 rounded-[var(--radius-control)] border bg-[var(--panel-2)] border-[var(--border)] text-[var(--ink-1)] text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </div>
            )}
          </div>
        }
      />

      {/* 单集重新生成配置面板 */}
      <ConfigPanel
        open={regenerateOpen}
        onOpenChange={(open) => { setRegenerateOpen(open); if (!open) setRegeneratingEpisodeId(null); }}
        title="重新生成该集剧本"
        description="使用 AI 重新生成当前集的剧本内容，将覆盖现有内容"
        modelType="text"
        onGenerate={doRegenerate}
        isLoading={isRegenerating}
        defaultModelKey={lastEpisodeModel}
      />

      {/* 覆盖已有剧集确认对话框 */}
      <Modal
        open={confirmOverwriteOpen}
        onOpenChange={setConfirmOverwriteOpen}
        title="覆盖已有剧集"
        description={`当前项目已有 ${episodes.length} 集剧集，重新生成将覆盖全部已有内容，是否继续？`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOverwriteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleConfirmOverwrite} leftIcon={<AlertTriangle className="w-4 h-4" />}>
              确认覆盖并生成
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 p-3 bg-[var(--accent-soft)]/50 rounded-lg border border-[var(--accent)]/30">
          <AlertTriangle className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--ink-2)]">
            <p className="font-medium text-[var(--ink-1)] mb-1">此操作不可撤销</p>
            <p>将删除现有 {episodes.length} 集剧集及其关联的分镜、关键帧等数据，并重新生成。</p>
          </div>
        </div>
      </Modal>

      {/* 未选择章节提示对话框 */}
      <Modal
        open={noChaptersDialogOpen}
        onOpenChange={setNoChaptersDialogOpen}
        title="请先选择章节"
        description="生成剧集需要先在小说管理中选择要改编的章节。"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoChaptersDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => { setNoChaptersDialogOpen(false); updatePipelineStep('novel'); }} leftIcon={<BookOpen className="w-4 h-4" />}>
              前往选择章节
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 p-3 bg-[var(--panel-2)]/50 rounded-lg border border-[var(--border)]">
          <BookOpen className="w-5 h-5 text-[var(--ink-3)] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--ink-2)]">
            <p>当前未选择任何小说章节。</p>
            <p className="mt-1">请先上传小说并选择需要改编的章节，再进行剧集生成。</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
