import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Film, MoreVertical, Pencil, Trash2, FolderOpen, Search, Clock, Sun, Moon, HelpCircle,
  BookOpen, Wand2, FileUp, ChevronRight, Zap, Settings, Users, Archive, ArchiveRestore,
  AlertTriangle, Coins, Sparkles, Layers, Server, RefreshCw, Activity, Boxes, GitBranch,
} from 'lucide-react';
import { Button, Card, EmptyState, Modal, Input, Badge } from './ui';
import { projectService } from '../services/projectService';
import { exportService } from '../services/exportService';
import { modelConfigService } from '../services/modelConfigService';
import { useUIStore } from '../stores/useUIStore';
import { StylePresetSelector } from './StylePreset/StylePresetSelector';
import { TaskCenter } from './ui/TaskCenter';
import type { Project, PipelineMode } from '../types';
import { formatRelativeTime } from '../utils';

type DashboardTab = 'active' | 'archived';

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<DashboardTab>('active');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newMode, setNewMode] = useState<PipelineMode>('semi-auto');
  const [newStylePresetId, setNewStylePresetId] = useState<string | undefined>(undefined);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingFromNovel] = useState(false);
  const [modelCount, setModelCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [permanentTarget, setPermanentTarget] = useState<Project | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast, theme, toggleTheme } = useUIStore();

  const loadModelCount = async () => {
    try {
      const res = await modelConfigService.list();
      const data = res.data as unknown as Record<string, unknown[] | undefined>;
      let count = 0;
      if (Array.isArray(data)) count = data.length;
      else if (data && typeof data === 'object') {
        Object.values(data).forEach((v) => {
          if (Array.isArray(v)) count += v.length;
        });
      }
      setModelCount(count);
    } catch {
      setModelCount(0);
    }
  };

  const loadProjects = async (status: DashboardTab = tab) => {
    setIsLoading(true);
    try {
      const res = await projectService.list({ status });
      if (res.success && res.data) {
        const items = res.data.items || [];
        if (status === 'archived') setArchivedProjects(items);
        else setProjects(items);
      }
    } catch {
      if (status === 'archived') setArchivedProjects([]);
      else setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects('active');
    loadProjects('archived');
    loadModelCount();
    if (searchParams.get('action') === 'new') {
      setCreateModalOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadProjects('active'), loadProjects('archived'), loadModelCount()]).finally(() => {
      setTimeout(() => setRefreshing(false), 400);
    });
  };

  const switchTab = (next: DashboardTab) => {
    if (next === tab) return;
    setTab(next);
    setMenuOpenId(null);
    loadProjects(next);
  };

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

  const handleArchive = async (id: string) => {
    setMenuOpenId(null);
    try {
      await projectService.delete(id);
      showToast('项目已移入回收站', 'success');
      loadProjects('active');
      loadProjects('archived');
    } catch {
      showToast('操作失败', 'error');
    }
  };

  const handleRestore = async (id: string) => {
    setMenuOpenId(null);
    try {
      await projectService.restore(id);
      showToast('项目已恢复', 'success');
      loadProjects('active');
      loadProjects('archived');
    } catch {
      showToast('恢复失败', 'error');
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentTarget) return;
    try {
      await projectService.deletePermanent(permanentTarget.id);
      showToast('项目已彻底删除', 'success');
      setPermanentTarget(null);
      loadProjects('archived');
    } catch {
      showToast('删除失败', 'error');
    }
  };

  const openRename = (project: Project) => {
    setMenuOpenId(null);
    setRenameTarget(project);
    setRenameTitle(project.title);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget || !renameTitle.trim() || renameTitle.trim() === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    try {
      await projectService.update(renameTarget.id, { title: renameTitle.trim() });
      showToast('项目已重命名', 'success');
      setRenameTarget(null);
      loadProjects(tab);
    } catch {
      showToast('重命名失败', 'error');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await exportService.importProject(file);
      if (res.success) {
        showToast('项目导入成功', 'success');
        loadProjects('active');
      }
    } catch {
      showToast('导入失败，请检查文件格式', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const getProjectProgress = (project: Project): number => {
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

  // 近 7 天活跃趋势（按项目 updated_at 统计，真实数据）
  const trendData = (() => {
    const days: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      const next = new Date(d.getTime() + 86400000);
      const count = [...projects, ...archivedProjects].filter((p) => {
        const t = new Date(p.updated_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      days.push({ label, count });
    }
    return days;
  })();
  const maxTrend = Math.max(1, ...trendData.map((d) => d.count));

  const filteredProjects = (tab === 'active' ? projects : archivedProjects).filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const navItems = [
    { label: '仪表盘', active: true },
    { label: '自由创作', onClick: () => navigate('/create') },
    { label: '模型库', onClick: () => navigate('/models') },
    { label: '成本统计', onClick: () => navigate('/costs') },
    { label: '查看流程', onClick: () => navigate('/mindmap') },
  ];

  const quickActions = [
    { label: '新建项目', desc: '从灵感开始创作', icon: Plus, onClick: () => setCreateModalOpen(true) },
    { label: '上传小说', desc: '从小说改编剧本', icon: BookOpen, onClick: handleStartFromNovel },
    { label: '自由创作', desc: '文生图/文生视频', icon: Sparkles, onClick: () => navigate('/create') },
    { label: '配置模型', desc: '接入 AI 服务', icon: Settings, onClick: () => navigate('/models') },
  ];

  return (
    <div className="min-h-screen bg-[var(--page)]">
      {/* 顶部终端状态条 */}
      <div className="border-b border-[var(--border)] bg-[rgba(10,15,28,0.9)]">
        <div className="max-w-[1560px] mx-auto px-8 py-1.5 flex items-center justify-between">
          <div className="term-line">
            <span className="text-[var(--ink-3)]">cineslice@local</span>
            <span className="text-[var(--ink-2)]">~ $</span>
            <span className="text-[var(--ink-1)]">cineslice dev --pipeline=auto</span>
          </div>
          <span className="status-dot status-dot--running">
            PIPELINE <span className="pulse-dot">●</span> RUNNING
          </span>
        </div>
      </div>

      {/* 导航栏 */}
      <header className="border-b border-[var(--border)] bg-[var(--card-bg)] sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-[1560px] mx-auto px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <button className="flex items-center gap-3 text-left" onClick={() => navigate('/')}>
              <div className="w-9 h-9 rounded-lg bg-[var(--accent)] flex items-center justify-center shadow-[0_0_16px_rgba(18,196,143,0.4)]">
                <Film className="w-5 h-5 text-[var(--on-accent)]" />
              </div>
              <div>
                <div className="text-base font-bold text-[var(--ink-1)] leading-tight font-[var(--font-display)]">CineSlice Studio</div>
                <div className="text-[11px] text-[var(--ink-3)] font-mono leading-tight">Design Intelligence Pipeline</div>
              </div>
            </button>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    item.active
                      ? 'text-[var(--accent)] bg-[var(--accent-soft)] font-medium'
                      : 'text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-2)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <TaskCenter />
            <Button variant="ghost" size="icon" onClick={toggleTheme} title="切换主题">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" title="帮助">
              <HelpCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1560px] mx-auto px-8 py-6">
        {/* 页面标题区 */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="term-label mb-1.5">LIVE TELEMETRY</div>
            <h1 className="text-2xl font-bold text-[var(--ink-1)] font-[var(--font-display)] mb-1.5">创作流水线仪表盘</h1>
            <div className="term-line term-line--dim">
              <span className="text-[var(--ink-3)]">cineslice@local</span>
              <span className="text-[var(--ink-2)]">~ $</span>
              <span className="text-[var(--ink-1)]">tail -f /pipeline --live</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>

        {/* 指标卡 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-[var(--radius-card)] bg-[var(--card-bg)] border border-[var(--border)] p-5 marquee-border">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-[var(--term-cyan)]" />
              <span className="metric-label">总项目数</span>
            </div>
            <div className="metric-value text-3xl mb-1">{projects.length + archivedProjects.length}</div>
            <div className="metric-label">进行中 {projects.length} · 回收站 {archivedProjects.length}</div>
          </div>
          <div className="rounded-[var(--radius-card)] bg-[var(--card-bg)] border border-[var(--border)] p-5 marquee-border">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="w-4 h-4 text-[var(--accent)]" />
              <span className="metric-label">流水线阶段</span>
            </div>
            <div className="metric-value text-3xl mb-1">9</div>
            <div className="metric-label">小说 → 剧集 → 剧本 → 分镜 → 视频</div>
          </div>
          <div className="rounded-[var(--radius-card)] bg-[var(--card-bg)] border border-[var(--border)] p-5 marquee-border">
            <div className="flex items-center gap-2 mb-3">
              <Boxes className="w-4 h-4 text-[var(--term-purple)]" />
              <span className="metric-label">AI 模型</span>
            </div>
            <div className="metric-value text-3xl mb-1">{modelCount}</div>
            <div className="metric-label">已配置 · 多服务商</div>
          </div>
          <div className="rounded-[var(--radius-card)] bg-[var(--card-bg)] border border-[var(--border)] p-5 marquee-border">
            <div className="flex items-center gap-2 mb-3">
              <Server className="w-4 h-4 text-[var(--term-green)]" />
              <span className="metric-label">运行模式</span>
            </div>
            <div className="metric-value text-3xl mb-1">local</div>
            <div className="metric-label">本地部署 · SQLite</div>
          </div>
        </div>

        {/* 双栏：项目状态 + 快捷操作 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* 左：项目状态列表 */}
          <div className="lg:col-span-2 rounded-[var(--radius-card)] bg-[var(--card-bg)] border border-[var(--border)] p-5 marquee-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="term-label mb-1">PROJECT STATUS</div>
                <h2 className="text-base font-bold text-[var(--ink-1)]">项目状态</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => switchTab('active')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === 'active'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  }`}
                >
                  进行中
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('archived')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    tab === 'archived'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  回收站
                </button>
                <Badge variant="default" className="ml-1">{filteredProjects.length}</Badge>
              </div>
            </div>

            {/* 搜索 */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
              <Input
                placeholder="搜索项目..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-72"
              />
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 skeleton rounded-lg" />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <Card className="bg-transparent border-none shadow-none">
                <EmptyState
                  icon={tab === 'archived' ? <Archive className="w-10 h-10" /> : <FolderOpen className="w-10 h-10" />}
                  title={tab === 'archived' ? '回收站是空的' : searchQuery ? '没有找到匹配的项目' : '还没有项目'}
                  description={
                    tab === 'archived'
                      ? '删除的项目会保留在这里，可随时恢复'
                      : searchQuery
                        ? '试试其他关键词'
                        : '点击右侧快捷操作开始创作你的第一个 AI 短剧'
                  }
                />
              </Card>
            ) : (
              <div className="space-y-2.5 relative">
                {menuOpenId && (
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpenId(null)} />
                )}
                {filteredProjects.map((project) => {
                  const progress = getProjectProgress(project);
                  const isArchived = tab === 'archived';
                  return (
                    <div
                      key={project.id}
                      onClick={isArchived ? undefined : () => navigate(`/projects/${project.id}`)}
                      className={`group rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--panel-2)]/60 px-4 py-3 flex items-center gap-4 transition-all hover:border-[var(--border-hover)] ${
                        isArchived ? 'opacity-80' : 'cursor-pointer'
                      } ${menuOpenId === project.id ? 'z-40' : ''}`}
                    >
                      {/* 图标 */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isArchived ? 'bg-[var(--panel-3)] text-[var(--ink-3)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      }`}>
                        <Film className="w-5 h-5" />
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-[var(--ink-1)] truncate">{project.title}</h3>
                          {isArchived ? (
                            <Badge variant="default"><Archive className="w-3 h-3 mr-1 inline" />已归档</Badge>
                          ) : (
                            <Badge variant="accent">{getStepLabel(project.pipeline_step)}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-[var(--ink-3)] font-mono">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {formatRelativeTime(project.updated_at)}
                          </span>
                          {!isArchived && (
                            <span className="flex items-center gap-1.5">
                              <span className="text-[var(--term-green)]">{progress}%</span>
                              <span className="w-24 h-1 bg-[var(--panel-3)] rounded-full overflow-hidden inline-block align-middle">
                                <span className="block h-full bg-[var(--accent)] rounded-full" style={{ width: `${progress}%` }} />
                              </span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 右侧操作 */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isArchived && (
                          <span className="hidden md:flex items-center gap-1 text-sm text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity">
                            继续制作
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        )}
                        <div className="relative">
                          <button
                            type="button"
                            className={`w-8 h-8 rounded-md flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-3)] ${isArchived ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === project.id ? null : project.id);
                            }}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {menuOpenId === project.id && (
                            <div className="absolute right-0 top-9 w-40 bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-[var(--shadow-float)] py-1 z-50">
                              {!isArchived ? (
                                <>
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-[var(--ink-1)] hover:bg-[var(--panel-2)] flex items-center gap-2"
                                    onClick={(e) => { e.stopPropagation(); openRename(project); }}
                                  >
                                    <Pencil className="w-4 h-4" /> 重命名
                                  </button>
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-[var(--ink-1)] hover:bg-[var(--panel-2)] flex items-center gap-2"
                                    onClick={(e) => { e.stopPropagation(); handleArchive(project.id); }}
                                  >
                                    <Archive className="w-4 h-4" /> 移入回收站
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-[var(--ink-1)] hover:bg-[var(--panel-2)] flex items-center gap-2"
                                    onClick={(e) => { e.stopPropagation(); handleRestore(project.id); }}
                                  >
                                    <ArchiveRestore className="w-4 h-4" /> 恢复项目
                                  </button>
                                  <button
                                    className="w-full px-3 py-2 text-left text-sm text-[var(--term-red)] hover:bg-[var(--term-red)]/10 flex items-center gap-2"
                                    onClick={(e) => { e.stopPropagation(); setPermanentTarget(project); }}
                                  >
                                    <Trash2 className="w-4 h-4" /> 彻底删除
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 右：快捷操作 */}
          <div className="rounded-[var(--radius-card)] bg-[var(--card-bg)] border border-[var(--border)] p-5 marquee-border">
            <div className="term-label mb-1">QUICK ACTIONS</div>
            <h2 className="text-base font-bold text-[var(--ink-1)] mb-4">快捷操作</h2>
            <div className="space-y-2 mb-6">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--panel-2)]/50 hover:border-[var(--border-hover)] hover:bg-[var(--accent-soft)] transition-all group"
                >
                  <div className="w-8 h-8 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <action.icon className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-[var(--ink-1)]">{action.label}</div>
                    <div className="text-xs text-[var(--ink-3)]">{action.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* 端点信息 */}
            <div className="rounded-lg border border-[var(--border)] bg-[rgba(10,15,28,0.6)] px-3 py-3">
              <div className="term-label mb-1.5">PIPELINE_ENDPOINT</div>
              <div className="term-line">
                <span className="text-[var(--term-cyan)]">http://127.0.0.1:3000/api</span>
              </div>
            </div>
          </div>
        </div>

        {/* 近 7 天活跃趋势 */}
        <div className="rounded-[var(--radius-card)] bg-[var(--card-bg)] border border-[var(--border)] p-5 mb-8 marquee-border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="term-label mb-1">ACTIVITY</div>
              <h2 className="text-base font-bold text-[var(--ink-1)]">近 7 天项目活跃</h2>
            </div>
            <div className="term-line term-line--dim"><span className="text-[var(--ink-3)]">按项目更新时间统计</span></div>
          </div>
          <div className="flex items-end gap-3 h-28">
            {trendData.map((d) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                <span className="text-xs font-mono text-[var(--ink-2)]">{d.count || ''}</span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-[var(--accent)]/30 to-[var(--accent)] transition-all"
                  style={{ height: `${Math.max(6, (d.count / maxTrend) * 72)}px`, opacity: d.count > 0 ? 1 : 0.15 }}
                />
                <span className="text-[11px] font-mono text-[var(--ink-3)]">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
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

          <StylePresetSelector
            value={newStylePresetId}
            onChange={(id) => setNewStylePresetId(id)}
            showDetails={false}
          />
        </div>
      </Modal>

      {/* 重命名弹窗 */}
      <Modal
        open={!!renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        title="重命名项目"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>取消</Button>
            <Button onClick={handleRenameSubmit}>保存</Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-[var(--ink-2)]">项目名称</label>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
          />
        </div>
      </Modal>

      {/* 彻底删除弹窗 */}
      <Modal
        open={!!permanentTarget}
        onOpenChange={(open) => !open && setPermanentTarget(null)}
        title="彻底删除项目"
        description="此操作不可恢复，项目及其全部数据将被永久删除。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPermanentTarget(null)}>取消</Button>
            <Button variant="danger" onClick={handlePermanentDelete} leftIcon={<Trash2 className="w-4 h-4" />}>
              确认删除
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--term-red)]/10 border border-[var(--term-red)]/20">
          <AlertTriangle className="w-5 h-5 text-[var(--term-red)] flex-shrink-0" />
          <p className="text-sm text-[var(--ink-1)]">
            即将删除 <span className="font-semibold">{permanentTarget?.title}</span>，包括所有剧集、分镜、资产与生成记录。
          </p>
        </div>
      </Modal>
    </div>
  );
}
