import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  FileUp,
  Sparkles,
  RefreshCw,
  Edit3,
  Check,
  ChevronRight,
  Users,
  Package,
  Film,
  FileText,
  Save,
  Wand2,
} from 'lucide-react';
import { Button, Card, Tabs, EmptyState, Badge, Textarea, Input } from '../ui';
import { SectionHeader } from '../common';
import { useProjectStore } from '../../stores/useProjectStore';
import { useUIStore } from '../../stores/useUIStore';
import { projectService } from '../../services/projectService';
import { propService } from '../../services/assetService';
import { formatWordCount } from '../../services/novelParser';
import { useDefaultModels } from '../../hooks/useDefaultModels';
import { ROLE_TYPE_LABELS, GENDER_LABELS } from '../../utils';
import type { Prop, Episode, NovelChapter } from '../../types';

/**
 * 第 1 段 · 项目大纲页
 * 核心按钮（3个）：上传小说/重新生成大纲 · 编辑大纲 · 确认并进入角色设定
 */
export function StageOutline() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    currentProject,
    chapters,
    episodes,
    characters,
    currentEpisodeId,
    setChapters,
    setSelectedChapterIds,
    setEpisodes,
    setCurrentEpisode,
    updateEpisode,
    loadCharacters,
  } = useProjectStore();
  const { showToast } = useUIStore();
  const { getDefaultModel } = useDefaultModels();

  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [props, setProps] = useState<Prop[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 编辑态：单集大纲编辑
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [isSavingEpisode, setIsSavingEpisode] = useState(false);

  const sortedEpisodes = [...episodes].sort((a, b) => a.episode_number - b.episode_number);
  const totalWords = chapters.reduce((sum, c) => sum + c.word_count, 0);
  const uploadedFileName = currentProject?.novel_config?.source_file as string | undefined
    ?? (chapters[0]?.source_file as string | undefined)
    ?? `${currentProject?.title || '小说'}.txt`;

  // 加载当前剧集的角色（人物表）与道具（资产清单）
  useEffect(() => {
    if (currentEpisodeId) {
      loadCharacters(currentEpisodeId);
      propService
        .list(currentEpisodeId)
        .then((res) => {
          if (res.success && res.data) setProps(res.data);
        })
        .catch(() => setProps([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEpisodeId]);

  const handleFile = async (file: File) => {
    if (!currentProject) return;
    const validTypes = ['.txt', '.md'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(ext)) {
      showToast('仅支持 .txt 和 .md 格式', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('文件大小不能超过 10MB', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const res = await projectService.uploadNovel(currentProject.id, file);
      if (res.success && res.data) {
        setChapters(res.data.chapters);
        setSelectedChapterIds(res.data.chapters.map((c: NovelChapter) => c.id));
        showToast(`成功解析 ${res.data.total_chapters} 个章节，点击「重新生成大纲」生成分集梗概`, 'success');
      } else {
        const errMsg = (res as any)?.error?.message || '上传失败，请重试';
        showToast(errMsg, 'error');
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || err?.message || '上传失败，请重试';
      showToast(errMsg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  /** 核心按钮 1：上传小说 / 重新生成大纲 */
  const handlePrimaryAction = () => {
    if (chapters.length === 0) {
      fileInputRef.current?.click();
      return;
    }
    handleRegenerateOutline();
  };

  const handleRegenerateOutline = async () => {
    if (!currentProject) return;
    if (chapters.length === 0) {
      fileInputRef.current?.click();
      return;
    }
    const modelKey = getDefaultModel('text');
    if (!modelKey) {
      showToast('请先在设置中配置默认文本模型', 'error');
      return;
    }
    setIsRegenerating(true);
    try {
      const res = await projectService.generateEpisodes(currentProject.id, {
        chapter_ids: chapters.map((c) => c.id),
        modelKey,
      });
      if (res.success && res.data) {
        setEpisodes(res.data);
        if (res.data.length > 0) {
          setCurrentEpisode(res.data[0].id);
        }
        showToast(`大纲已重新生成：${res.data.length} 集`, 'success');
      } else {
        const errMsg = (res as any)?.error?.message || '重新生成失败';
        showToast(errMsg, 'error');
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || '重新生成失败，请检查模型配置';
      showToast(errMsg, 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  // 编辑态：开始编辑某集
  const startEditEpisode = (episode: Episode) => {
    setEditingEpisodeId(episode.id);
    setEditTitle(episode.title);
    setEditSummary(episode.script_content || '');
  };

  const saveEpisodeEdit = async () => {
    if (!editingEpisodeId) return;
    setIsSavingEpisode(true);
    try {
      const res = await projectService.updateEpisode(editingEpisodeId, {
        title: editTitle.trim() || '未命名剧集',
        script_content: editSummary,
      });
      if (res.success && res.data) {
        updateEpisode(editingEpisodeId, {
          title: res.data.title,
          script_content: res.data.script_content,
        });
        showToast('该集大纲已保存', 'success');
        setEditingEpisodeId(null);
      } else {
        showToast((res as any)?.error?.message || '保存失败', 'error');
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || '保存失败', 'error');
    } finally {
      setIsSavingEpisode(false);
    }
  };

  const handleGoToCharacters = () => {
    if (!id) return;
    navigate(`/project/${id}/characters`);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* 顶部：标题 + 操作按钮 */}
      <SectionHeader
        icon={<BookOpen className="w-5 h-5 text-[var(--accent)]" />}
        title="项目大纲"
        description="上传小说，AI生成改编说明、人物表、爽点表、分集梗概、资产清单"
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              leftIcon={editMode ? <Check className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              onClick={() => setEditMode(!editMode)}
            >
              {editMode ? '完成编辑' : '编辑大纲'}
            </Button>
            <Button
              size="md"
              leftIcon={chapters.length === 0 ? <FileUp className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
              onClick={handlePrimaryAction}
              isLoading={isUploading || isRegenerating}
              disabled={!currentProject}
            >
              {isUploading ? '上传中...' : isRegenerating ? '生成中...' : chapters.length === 0 ? '上传小说' : '重新生成大纲'}
            </Button>
          </>
        }
      />

      {/* 小说上传区（简化版：仅上传按钮 + 已上传信息） */}
      <Card className="p-6">
        {chapters.length === 0 ? (
          <div
            className={`border-2 border-dashed rounded-[var(--radius-shell)] p-10 text-center transition-all duration-300 cursor-pointer ${
              isDragging
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] scale-[1.01]'
                : 'border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--panel-2)]/30'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-all ${isUploading ? 'animate-pulse' : ''}`}
              style={{ background: 'linear-gradient(135deg, var(--accent-soft), rgba(251,146,60,0.1))' }}
            >
              {isUploading ? (
                <div className="w-7 h-7 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileUp className="w-8 h-8 text-[var(--accent)]" />
              )}
            </div>
            <p className="text-base font-semibold text-[var(--ink-1)] mb-1 font-[var(--font-display)]">
              {isUploading ? '正在解析小说...' : '拖拽文件到此处，或点击上传'}
            </p>
            <p className="text-sm text-[var(--ink-3)] mb-4">支持 .txt / .md 格式，最大 10MB</p>
            <Button size="md" leftIcon={<FileUp className="w-4 h-4" />} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              上传小说
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--ink-1)] truncate">{uploadedFileName}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-[var(--ink-3)]">
                <Badge variant="accent">{chapters.length} 章</Badge>
                <Badge variant="default">{formatWordCount(totalWords)}</Badge>
                <Badge variant="success">{episodes.length} 集</Badge>
              </div>
            </div>
            <Button variant="ghost" size="sm" leftIcon={<FileUp className="w-3.5 h-3.5" />} onClick={() => fileInputRef.current?.click()}>
              重新上传
            </Button>
          </div>
        )}
      </Card>

      {/* 大纲五件套 */}
      <Tabs defaultValue="adaptation">
        <Tabs.List>
          <Tabs.Trigger value="adaptation">改编说明</Tabs.Trigger>
          <Tabs.Trigger value="characters">
            <Users className="w-4 h-4 mr-1.5" />人物表
            <span className="ml-1.5 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">{characters.length}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="thrills">爽点表</Tabs.Trigger>
          <Tabs.Trigger value="episodes">
            <Film className="w-4 h-4 mr-1.5" />分集梗概
            <span className="ml-1.5 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">{episodes.length}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="assets">
            <Package className="w-4 h-4 mr-1.5" />资产清单
            <span className="ml-1.5 text-xs text-[var(--ink-3)] bg-[var(--panel-2)] px-1.5 py-0.5 rounded-full">{props.length}</span>
          </Tabs.Trigger>
        </Tabs.List>

        {/* Tab 1 改编说明 */}
        <Tabs.Content value="adaptation">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <h3 className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">小说改编说明</h3>
                <p className="text-xs text-[var(--ink-3)]">基于上传小说与剧集生成结果自动汇总</p>
              </div>
            </div>
            {currentProject && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h4 className="text-lg font-bold text-[var(--ink-1)] font-[var(--font-display)]">{currentProject.title}</h4>
                  {currentProject.genre && <Badge variant="accent">{currentProject.genre}</Badge>}
                  {currentProject.style_description && <Badge variant="default">风格：{currentProject.style_description}</Badge>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-4 rounded-[var(--radius-card)] bg-[var(--panel-2)] border border-[var(--border)]">
                    <p className="text-xs text-[var(--ink-3)] mb-1">章节数</p>
                    <p className="text-xl font-bold text-[var(--ink-1)]">{chapters.length} 章</p>
                  </div>
                  <div className="p-4 rounded-[var(--radius-card)] bg-[var(--panel-2)] border border-[var(--border)]">
                    <p className="text-xs text-[var(--ink-3)] mb-1">原作体量</p>
                    <p className="text-xl font-bold text-[var(--ink-1)]">{formatWordCount(totalWords)}</p>
                  </div>
                  <div className="p-4 rounded-[var(--radius-card)] bg-[var(--panel-2)] border border-[var(--border)]">
                    <p className="text-xs text-[var(--ink-3)] mb-1">改编集数</p>
                    <p className="text-xl font-bold text-[var(--ink-1)]">{episodes.length} 集</p>
                  </div>
                  <div className="p-4 rounded-[var(--radius-card)] bg-[var(--panel-2)] border border-[var(--border)]">
                    <p className="text-xs text-[var(--ink-3)] mb-1">提取角色</p>
                    <p className="text-xl font-bold text-[var(--ink-1)]">{characters.length} 个</p>
                  </div>
                </div>
                {(currentProject.description || currentProject.style_description) && (
                  <div>
                    <p className="text-xs font-medium text-[var(--ink-2)] mb-1.5">改编方向</p>
                    <p className="text-sm text-[var(--ink-2)] leading-relaxed">
                      {currentProject.description || '改编为剧集式叙事，保留原作核心情节与人物关系，节奏适配短视频分发。'}
                      {currentProject.style_description ? ` 视觉风格：${currentProject.style_description}。` : ''}
                    </p>
                  </div>
                )}
              </div>
            )}
            {!currentProject && (
              <EmptyState icon={<Wand2 className="w-8 h-8" />} title="暂无改编说明" description="上传小说并生成大纲后，AI 将在此生成完整改编说明" />
            )}
          </Card>
        </Tabs.Content>

        {/* Tab 2 人物表 */}
        <Tabs.Content value="characters">
          {characters.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users className="w-8 h-8" />}
                title="暂无人物数据"
                description="进入「角色设定」页后由 AI 提取，或生成剧集后自动可见"
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel-2)]/30">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-[var(--accent)]" />
                  <span className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">人物表</span>
                  <Badge variant="accent">{characters.length} 人</Badge>
                </div>
                <span className="text-xs text-[var(--ink-3)]">当前剧集</span>
              </div>
              <div className="divide-y divide-[var(--border-light)]">
                {characters.map((character) => (
                  <div key={character.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-lg bg-[var(--panel-2)] flex items-center justify-center flex-shrink-0 text-xs font-mono text-[var(--ink-3)]">
                      {character.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[var(--ink-1)] truncate">{character.name}</p>
                        <Badge variant="default">{ROLE_TYPE_LABELS[character.role_type] || character.role_type}</Badge>
                        <Badge variant="default">{GENDER_LABELS[character.gender] || character.gender}</Badge>
                      </div>
                      <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">
                        {character.description || character.visual_description || '暂无描述'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Tabs.Content>

        {/* Tab 3 爽点表 */}
        <Tabs.Content value="thrills">
          <Card>
            <EmptyState
              icon={<Sparkles className="w-8 h-8" />}
              title="爽点表"
              description="AI生成后可见"
            />
          </Card>
        </Tabs.Content>

        {/* Tab 4 分集梗概 */}
        <Tabs.Content value="episodes">
          {episodes.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Film className="w-8 h-8" />}
                title="还没有分集梗概"
                description={chapters.length === 0 ? '请先上传小说，再生成分集梗概' : '点击右上角「重新生成大纲」，AI 将小说章节改编为剧集梗概'}
                action={
                  chapters.length > 0 ? (
                    <Button leftIcon={<Sparkles className="w-4 h-4" />} onClick={handleRegenerateOutline} isLoading={isRegenerating}>
                      生成大纲
                    </Button>
                  ) : (
                    <Button leftIcon={<FileUp className="w-4 h-4" />} onClick={() => fileInputRef.current?.click()}>
                      上传小说
                    </Button>
                  )
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedEpisodes.map((episode) => (
                <Card key={episode.id} className="p-4">
                  {editMode && editingEpisodeId === episode.id ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-[var(--panel-2)] flex items-center justify-center flex-shrink-0 text-sm font-bold text-[var(--ink-2)]">
                          {String(episode.episode_number).padStart(2, '0')}
                        </div>
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="剧集标题"
                          className="flex-1"
                        />
                      </div>
                      <Textarea
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                        rows={4}
                        placeholder="本集梗概..."
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setEditingEpisodeId(null)} disabled={isSavingEpisode}>
                          取消
                        </Button>
                        <Button size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} onClick={saveEpisodeEdit} isLoading={isSavingEpisode}>
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-[var(--panel-2)] flex items-center justify-center flex-shrink-0 text-sm font-bold text-[var(--ink-2)]">
                        {String(episode.episode_number).padStart(2, '0')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-[var(--ink-1)] truncate">{episode.title}</h4>
                          {episode.chapter_range && <Badge variant="default" className="text-xs">{episode.chapter_range}</Badge>}
                        </div>
                        <p className="text-sm text-[var(--ink-3)] leading-relaxed">
                          {episode.script_content?.slice(0, 200) || '暂无梗概'}
                          {(episode.script_content?.length ?? 0) > 200 ? '...' : ''}
                        </p>
                        {editMode && (
                          <Button variant="ghost" size="sm" className="mt-2" leftIcon={<Edit3 className="w-3.5 h-3.5" />} onClick={() => startEditEpisode(episode)}>
                            编辑本集
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* Tab 5 资产清单 */}
        <Tabs.Content value="assets">
          {props.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Package className="w-8 h-8" />}
                title="暂无资产数据"
                description="AI生成后可见"
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--panel-2)]/30">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-[var(--accent)]" />
                  <span className="font-semibold text-[var(--ink-1)] font-[var(--font-display)]">叙事道具表</span>
                  <Badge variant="accent">{props.length} 件</Badge>
                </div>
                <span className="text-xs text-[var(--ink-3)]">当前剧集</span>
              </div>
              <div className="divide-y divide-[var(--border-light)]">
                {props.map((prop) => (
                  <div key={prop.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-lg bg-[var(--panel-2)] flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-[var(--ink-3)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[var(--ink-1)] truncate">{prop.name}</p>
                        {prop.category && <Badge variant="default">{prop.category}</Badge>}
                        {prop.is_clue ? <Badge variant="danger">线索道具</Badge> : null}
                      </div>
                      <p className="text-xs text-[var(--ink-3)] mt-0.5 truncate">{prop.description || '暂无描述'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Tabs.Content>
      </Tabs>

      {/* 底部：确认并进入角色设定 */}
      <div className="sticky bottom-4 z-10">
        <Card className="p-4 flex items-center justify-between shadow-lg border-[var(--accent)]/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Users className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink-1)]">
                {episodes.length > 0 ? `大纲已就绪：${episodes.length} 集 · ${characters.length} 个角色` : '大纲待生成'}
              </p>
              <p className="text-xs text-[var(--ink-3)]">确认后进入第 2 段：角色设定</p>
            </div>
          </div>
          <Button onClick={handleGoToCharacters} disabled={episodes.length === 0} rightIcon={<ChevronRight className="w-4 h-4" />}>
            确认并进入角色设定
          </Button>
        </Card>
      </div>
    </div>
  );
}
