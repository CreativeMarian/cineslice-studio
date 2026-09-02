import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Film, MoreVertical, Pencil, Trash2, FolderOpen, Search, Clock, Sun, Moon, HelpCircle, BookOpen, Wand2, FileUp, ChevronRight, Zap, Settings, Users } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Input, Badge } from './ui';
import { projectService } from '../services/projectService';
import { exportService } from '../services/exportService';
import { useUIStore } from '../stores/useUIStore';
import { StylePresetSelector } from './StylePreset/StylePresetSelector';
import type { Project, PipelineMode } from '../types';
import { formatRelativeTime } from '../utils';

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMode, setNewMode] = useState<PipelineMode>('semi-auto');
  const [newStylePresetId, setNewStylePresetId] = useState<string | undefined>(undefined);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingFromNovel] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { showToast, theme, toggleTheme } = useUIStore();

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const res = await projectService.list({ status: 'active' });
      if (res.success && res.data) {
        setProjects(res.data.items || []);
      }
    } catch {
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // 从小说开始：打开创建弹窗（包含风格选择），创建后跳转到小说管理页
  const handleStartFromNovel = () => {
    setCreateModalOpen(true);
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await projectService.create({
        title: newTitle,
        description: newDesc,
        mode: newMode,
        style_preset_id: newStylePresetId,
      });
      if (res.success && res.data) {
        showToast('项目创建成功', 'success');
        setCreateModalOpen(false);
        setNewTitle('');
        setNewDesc('');
        setNewMode('semi-auto');
        setNewStylePresetId(undefined);
        navigate(`/projects/${res.data.id}`);
      }
    } catch {
      showToast('创建失败，请重试', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await projectService.delete(id);
      showToast('项目已删除', 'success');
      loadProjects();
    } catch {
      showToast('删除失败', 'error');
    }
    setMenuOpenId(null);
  };

  const handleRename = (project: Project) => {
    const newTitle = window.prompt('输入新的项目名称', project.title);
    if (newTitle && newTitle.trim() && newTitle !== project.title) {
      projectService.update(project.id, { title: newTitle.trim() })
        .then(() => {
          showToast('项目已重命名', 'success');
          loadProjects();
        })
        .catch(() => showToast('重命名失败', 'error'));
    }
    setMenuOpenId(null);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await exportService.importProject(file);
      if (res.success) {
        showToast('项目导入成功', 'success');
        loadProjects();
      }
    } catch {
      showToast('导入失败，请检查文件格式', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // 计算项目进度（0-100）
  const getProjectProgress = (project: Project): number => {
    // 简单根据 pipeline_step 估算
    const stepOrder = ['novel', 'episodes', 'script', 'shots'];
    const stepIndex = stepOrder.indexOf(project.pipeline_step || 'novel');
    return Math.round(((stepIndex + 1) / stepOrder.length) * 100);
  };

  const getStepLabel = (step?: string): string => {
    const labels: Record<string, string> = {
      novel: '上传小说',
      episodes: '生成剧集',
      script: '编辑剧本',
      shots: '生成分镜',
    };
    return labels[step || 'novel'] || '准备中';
  };

  const filteredProjects = projects.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[var(--page)]">
      {/* 顶部栏 */}
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_16px_rgba(249,115,22,0.3)]">
              <Film className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--ink-1)] font-[var(--font-display)]">CineSlice Studio</h1>
              <p className="text-xs text-[var(--ink-3)]">AI 驱动的漫剧/短剧生产流水线</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
              <Input
                placeholder="搜索项目..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-56"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="切换主题">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button variant="ghost" size="icon" title="帮助">
              <HelpCircle className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 欢迎Hero区域 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--accent)]/10 via-purple-500/5 to-transparent border border-[var(--border)] p-8 mb-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[var(--accent)]/20 to-transparent rounded-bl-full" />
          <div className="absolute bottom-0 left-1/2 w-96 h-32 bg-gradient-to-t from-purple-500/10 to-transparent" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_8px_24px_rgba(249,115,22,0.3)]">
                <Film className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--ink-1)] font-[var(--font-display)]">欢迎使用 CineSlice Studio</h1>
                <p className="text-sm text-[var(--ink-3)]">AI 驱动的全流程漫剧/短剧生产流水线 · 从小说到成片，一键搞定</p>
              </div>
            </div>
            
            {/* 核心优势 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-[var(--bg)]/60 border border-[var(--border)]">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center mb-2">
                  <Zap className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <h4 className="text-sm font-semibold text-[var(--ink-1)] mb-1">全自动流水线</h4>
                <p className="text-xs text-[var(--ink-3)]">9阶段一键生成，无需人工干预</p>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg)]/60 border border-[var(--border)]">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-2">
                  <Users className="w-4 h-4 text-purple-500" />
                </div>
                <h4 className="text-sm font-semibold text-[var(--ink-1)] mb-1">人物一致性</h4>
                <p className="text-xs text-[var(--ink-3)]">角色概念图+参考图，全片统一</p>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg)]/60 border border-[var(--border)]">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2">
                  <Wand2 className="w-4 h-4 text-blue-500" />
                </div>
                <h4 className="text-sm font-semibold text-[var(--ink-1)] mb-1">智能提示词</h4>
                <p className="text-xs text-[var(--ink-3)]">剧本分析+两层优化，自动生成</p>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg)]/60 border border-[var(--border)]">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
                  <Settings className="w-4 h-4 text-green-500" />
                </div>
                <h4 className="text-sm font-semibold text-[var(--ink-1)] mb-1">多模型支持</h4>
                <p className="text-xs text-[var(--ink-3)]">50+模型，自由切换，成本可控</p>
              </div>
            </div>

            {/* 模型统计 + 快速开始 */}
            <div className="flex flex-wrap items-center gap-6 mt-6 pt-6 border-t border-[var(--border)]">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[var(--accent)]">50+</div>
                  <div className="text-xs text-[var(--ink-3)]">AI模型</div>
                </div>
                <div className="w-px h-8 bg-[var(--border)]" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-500">9</div>
                  <div className="text-xs text-[var(--ink-3)]">制作阶段</div>
                </div>
                <div className="w-px h-8 bg-[var(--border)]" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-500">5</div>
                  <div className="text-xs text-[var(--ink-3)]">风格预设</div>
                </div>
                <div className="w-px h-8 bg-[var(--border)]" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">100%</div>
                  <div className="text-xs text-[var(--ink-3)]">本地部署</div>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => navigate('/models')}>
                  <Settings className="w-4 h-4 mr-1" /> 配置模型
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/mindmap')}>
                  <BookOpen className="w-4 h-4 mr-1" /> 查看流程
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* 三入口 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* 从小说开始 */}
          <Card
            hover
            className="p-6 cursor-pointer group relative overflow-hidden"
            onClick={handleStartFromNovel}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[var(--accent)]/10 to-transparent rounded-bl-full" />
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center mb-4 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--ink-1)] mb-1 font-[var(--font-display)]">从小说开始</h3>
              <p className="text-sm text-[var(--ink-3)] mb-4">创建项目，上传 .txt/.md 小说，自动解析章节，AI 改编为剧本</p>
              <div className="flex items-center text-sm text-[var(--accent)] font-medium group-hover:gap-2 transition-all">
                {isCreatingFromNovel ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    正在创建...
                  </>
                ) : (
                  <>
                    开始创作
                    <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* 从灵感开始 */}
          <Card
            hover
            className="p-6 cursor-pointer group relative overflow-hidden"
            onClick={() => setCreateModalOpen(true)}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-bl-full" />
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4 shadow-[0_4px_12px_rgba(168,85,247,0.3)]">
                <Wand2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--ink-1)] mb-1 font-[var(--font-display)]">从灵感开始</h3>
              <p className="text-sm text-[var(--ink-3)] mb-4">输入故事大纲或创意，AI 自动生成剧本和分镜</p>
              <div className="flex items-center text-sm text-purple-500 font-medium group-hover:gap-2 transition-all">
                创建空白项目
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Card>

          {/* 导入项目 */}
          <Card
            hover
            className="p-6 cursor-pointer group relative overflow-hidden"
            onClick={() => importFileRef.current?.click()}
          >
            <input
              ref={importFileRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleImport}
            />
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-green-500/10 to-transparent rounded-bl-full" />
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4 shadow-[0_4px_12px_rgba(34,197,94,0.3)]">
                <FileUp className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-[var(--ink-1)] mb-1 font-[var(--font-display)]">导入项目</h3>
              <p className="text-sm text-[var(--ink-3)] mb-4">上传 ZIP 备份文件，恢复之前的项目数据</p>
              <div className="flex items-center text-sm text-green-500 font-medium group-hover:gap-2 transition-all">
                选择 ZIP 文件
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Card>
        </div>

        {/* 项目列表 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--ink-1)] font-[var(--font-display)]">
            最近项目
            <Badge variant="default" className="ml-2">{projects.length}</Badge>
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 animate-pulse">
                <div className="h-32 bg-[var(--panel-2)] rounded-lg mb-4" />
                <div className="h-4 bg-[var(--panel-2)] rounded w-3/4 mb-2" />
                <div className="h-3 bg-[var(--panel-2)] rounded w-1/2" />
              </Card>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderOpen className="w-10 h-10" />}
              title={searchQuery ? '没有找到匹配的项目' : '还没有项目'}
              description={searchQuery ? '试试其他关键词' : '点击上方入口开始创作你的第一个 AI 漫剧/短剧'}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => {
              const progress = getProjectProgress(project);
              return (
                <Card
                  key={project.id}
                  hover
                  className="p-0 overflow-hidden cursor-pointer group"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  {/* 封面区域 */}
                  <div className="h-32 bg-gradient-to-br from-[var(--panel-2)] to-[var(--bg)] relative flex items-center justify-center">
                    <Film className="w-12 h-12 text-[var(--ink-3)]/30" />
                    <div className="absolute top-3 left-3">
                      <Badge variant="accent">{getStepLabel(project.pipeline_step)}</Badge>
                    </div>
                    <div className="absolute top-3 right-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === project.id ? null : project.id);
                        }}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                      {menuOpenId === project.id && (
                        <div className="absolute right-0 top-10 w-36 bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-xl py-1 z-10">
                          <button
                            className="w-full px-3 py-2 text-left text-sm text-[var(--ink-1)] hover:bg-[var(--panel-2)] flex items-center gap-2"
                            onClick={(e) => { e.stopPropagation(); handleRename(project); }}
                          >
                            <Pencil className="w-4 h-4" /> 重命名
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                            onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                          >
                            <Trash2 className="w-4 h-4" /> 删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 信息区域 */}
                  <div className="p-4">
                    <h3 className="font-semibold text-[var(--ink-1)] mb-1 truncate font-[var(--font-display)]">
                      {project.title}
                    </h3>
                    {project.description && (
                      <p className="text-sm text-[var(--ink-3)] line-clamp-1 mb-3">{project.description}</p>
                    )}

                    {/* 进度条 */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs text-[var(--ink-3)] mb-1">
                        <span>制作进度</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 bg-[var(--panel-2)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(project.updated_at)}
                      </span>
                      <span className="flex items-center gap-1 text-[var(--accent)] group-hover:gap-2 transition-all">
                        继续制作
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* 创建项目弹窗 */}
      <Modal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        title="创建新项目"
        description="输入项目信息，从灵感开始创作"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>取消</Button>
            <Button onClick={handleCreate} leftIcon={<Plus className="w-4 h-4" />}>创建项目</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">项目名称</label>
            <Input
              placeholder="输入项目名称"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5">项目描述（可选）</label>
            <Input
              placeholder="简短描述这个项目"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>

          {/* 流水线模式 */}
          <div>
            <label className="block text-sm font-medium text-[var(--ink-2)] mb-1.5 flex items-center gap-1">
              <Settings className="w-4 h-4" />
              流水线模式
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewMode('semi-auto')}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  newMode === 'semi-auto'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Wand2 className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm font-medium text-[var(--ink-1)]">半自动</span>
                </div>
                <p className="text-xs text-[var(--ink-3)]">每阶段生成后需确认，适合精细控制</p>
              </button>
              <button
                type="button"
                onClick={() => setNewMode('auto')}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  newMode === 'auto'
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm font-medium text-[var(--ink-1)]">全自动</span>
                </div>
                <p className="text-xs text-[var(--ink-3)]">上传小说后自动运行到视频生成</p>
              </button>
            </div>
          </div>

          {/* 风格预设 */}
          <StylePresetSelector
            value={newStylePresetId}
            onChange={(id) => setNewStylePresetId(id)}
            showDetails={false}
          />
        </div>
      </Modal>
    </div>
  );
}
