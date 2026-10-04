// 仪表盘：我的项目 —— 统计卡片 + 项目卡片网格（设计系统重构版）
// 功能保持不变：进行中/回收站、搜索、新建/上传小说/配置模型、重命名/归档/恢复/彻底删除、近7天活跃趋势
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Film, MoreVertical, Pencil, Trash2, FolderOpen, Search, Sun, Moon, HelpCircle,
  BookOpen, ChevronRight, Archive, ArchiveRestore,
  AlertTriangle, RefreshCw, Boxes, TrendingUp, Video, Clapperboard, Zap, Radio,
} from 'lucide-react';
import { Button, Card, EmptyState, Modal, Input, Badge } from './ui';
import { ProjectWizard } from './ProjectWizard';
import { projectService } from '../services/projectService';
import { modelConfigService } from '../services/modelConfigService';
import { pipelineService } from '../services/pipelineService';
import { costService } from '../services/costService';
import { useUIStore } from '../stores/useUIStore';
import { useProjectStore } from '../stores/useProjectStore';
import { TaskCenter } from './ui/TaskCenter';
import { showApiError } from '../utils/error';
import { PROJECT_NAME_MAX_LENGTH } from '../constants';
import type { Project } from '../types';
import { formatRelativeTime } from '../utils';

type DashboardTab = 'active' | 'archived';

/** 每个项目聚合统计（真实数据，来自 pipeline progress） */
interface ProjectAggStats {
  episodes: number;
  shots: number;
  videos: number;
}

const navItems = [
  { label: '仪表盘', active: true },
];

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<DashboardTab>('active');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [wizardInitialMode, setWizardInitialMode] = useState<'one_liner' | 'outline' | 'novel' | undefined>(undefined);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modelCount, setModelCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [permanentTarget, setPermanentTarget] = useState<Project | null>(null);
  const [aggStats, setAggStats] = useState<Record<string, ProjectAggStats>>({});
  const [aiCalls, setAiCalls] = useState(0);
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

  /** 聚合统计：并行拉取各进行中项目的镜头/视频/剧集数（静默失败归零） */
  const loadAggStats = async (list: Project[]) => {
    const entries = await Promise.all(
      list.map(async (p) => {
        try {
          const res = await pipelineService.getProgress(p.id);
          const st = res.data?.stages;
          return [
            p.id,
            {
              episodes: st?.episodes?.count ?? 0,
              shots: st?.shots?.count ?? 0,
              videos: st?.video?.count ?? 0,
            },
          ] as const;
        } catch {
          return [p.id, { episodes: 0, shots: 0, videos: 0 }] as const;
        }
      })
    );
    setAggStats(Object.fromEntries(entries));
  };

  /** AI 调用次数（成本统计，days=0 表示全部） */
  const loadAiCalls = async () => {
    try {
      const res = await costService.summary(0);
      setAiCalls(res.data?.call_count ?? 0);
    } catch {
      setAiCalls(0);
    }
  };

  const loadProjects = async (status: DashboardTab = tab) => {
    setIsLoading(true);
    try {
      const res = await projectService.list({ status });
      if (res.success && res.data) {
        const items = res.data.items || [];
        if (status === 'archived') setArchivedProjects(items);
        else {
          setProjects(items);
          loadAggStats(items);
        }
      }
    } catch {
      if (status === 'archived') setArchivedProjects([]);
      else {
        setProjects([]);
        setAggStats({});
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects('active');
    loadProjects('archived');
    loadModelCount();
    loadAiCalls();
    if (searchParams.get('action') === 'new') {
      setCreateModalOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadProjects('active'), loadProjects('archived'), loadModelCount(), loadAiCalls()]).finally(() => {
      setTimeout(() => setRefreshing(false), 400);
    });
  };

  const switchTab = (next: DashboardTab) => {
    if (next === tab) return;
    setTab(next);
    setMenuOpenId(null);
    loadProjects(next);
  };

  const openCreateWizard = (mode?: 'one_liner' | 'outline' | 'novel') => {
    setWizardInitialMode(mode);
    setCreateModalOpen(true);
  };

  const handleStartFromNovel = () => {
    openCreateWizard('novel');
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
      // P2-15: 同步刷新 store 中的项目信息（若重命名的正是当前打开的项目）
      const store = useProjectStore.getState();
      if (store.currentProject && store.currentProject.id === renameTarget.id) {
        store.setCurrentProject({ ...store.currentProject, title: renameTitle.trim() });
      }
    } catch (err: unknown) {
      showApiError(showToast, err, '重命名失败');
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

  /** 项目风格标签（视觉风格 > 类型 > 兜底） */
  const getStyleLabel = (project: Project): string => {
    return project.visual_style || project.genre || '创作中';
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

  // 统计卡片（真实数据聚合）
  const totalShots = projects.reduce((sum, p) => sum + (aggStats[p.id]?.shots || 0), 0);
  const totalVideos = projects.reduce((sum, p) => sum + (aggStats[p.id]?.videos || 0), 0);
  const totalProjects = projects.length + archivedProjects.length;

  const statCards = [
    {
      label: '项目数',
      value: totalProjects,
      note: `进行中 ${projects.length} · 回收站 ${archivedProjects.length}`,
      icon: Boxes,
      accent: 'text-[var(--accent)] bg-[var(--accent-soft)]',
    },
    {
      label: '总镜头数',
      value: totalShots,
      note: '全部项目累计分镜',
      icon: Clapperboard,
      accent: 'text-[var(--info)] bg-[var(--accent-soft)]',
    },
    {
      label: '已完成视频',
      value: totalVideos,
      note: '可进入导演台查看',
      icon: Video,
      accent: 'text-[var(--success)] bg-[rgba(16,185,129,0.12)]',
    },
    {
      label: 'AI 调用次数',
      value: aiCalls,
      note: `${modelCount} 个已配置模型`,
      icon: Zap,
      accent: 'text-[var(--warning)] bg-[rgba(245,158,11,0.12)]',
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--page)]">
      {/* 导航栏 */}
      <header className="border-b border-[var(--border)] bg-[var(--card-bg)] sticky top-0 z-40">
        <div className="max-w-[1560px] mx-auto px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <button className="flex items-center gap-3 text-left" onClick={() => navigate('/')}>
              <div className="w-9 h-9 rounded-lg bg-[var(--accent)] flex items-center justify-center">
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
                  onClick={() => navigate('/')}
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
        {/* 页面标题行：我的项目 + 操作按钮 */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-[20px] font-semibold text-[var(--ink-1)] tracking-tight">我的项目</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              leftIcon={<BookOpen className="w-4 h-4" />}
              onClick={handleStartFromNovel}
            >
              上传小说
            </Button>
            <Button
              variant="outline"
              size="md"
              leftIcon={<Radio className="w-4 h-4" />}
              onClick={() => navigate('/models')}
            >
              配置模型
            </Button>
            <Button
              variant="ghost"
              size="md"
              leftIcon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              刷新
            </Button>
            <Button
              size="md"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => openCreateWizard()}
            >
              新建项目
            </Button>
          </div>
        </div>

        {/* 统计卡片行 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {statCards.map((card) => (
            <Card key={card.label} className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[12px] text-[var(--ink-3)]">{card.label}</p>
                  <p className="mt-1.5 text-[28px] font-semibold leading-none text-[var(--ink-1)] tabular-nums">
                    {card.value.toLocaleString()}
                  </p>
                  <p className="mt-2 text-[11px] text-[var(--ink-3)] truncate">{card.note}</p>
                </div>
                <div className={`w-10 h-10 rounded-[var(--radius-control)] flex items-center justify-center flex-shrink-0 ${card.accent}`}>
                  <card.icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-[11px] text-[var(--ink-3)]">
                <TrendingUp className="w-3 h-3 text-[var(--accent-2)]" />
                实时统计
              </div>
            </Card>
          ))}
        </div>

        {/* 项目区：Tabs + 搜索 + 卡片网格 */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
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
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-3)]" />
              <Input
                placeholder="搜索项目..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-72"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 skeleton rounded-[var(--radius-card)]" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <Card>
              <EmptyState
                icon={tab === 'archived' ? <Archive className="w-10 h-10" /> : <FolderOpen className="w-10 h-10" />}
                title={tab === 'archived' ? '回收站是空的' : searchQuery ? '没有找到匹配的项目' : '还没有项目'}
                description={
                  tab === 'archived'
                    ? '删除的项目会保留在这里，可随时恢复'
                    : searchQuery
                      ? '试试其他关键词'
                      : '点击右上角「新建项目」开始创作你的第一个 AI 短剧'
                }
              />
            </Card>
          ) : (
            <div className="relative">
              {menuOpenId && (
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpenId(null)} />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {filteredProjects.map((project) => {
                  const progress = getProjectProgress(project);
                  const isArchived = tab === 'archived';
                  const stats = aggStats[project.id];
                  return (
                    <div
                      key={project.id}
                      onClick={isArchived ? undefined : () => navigate(`/project/${project.id}`)}
                      className={`group rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] px-4 py-4 transition-colors duration-150 hover:border-[var(--border-hover)] hover:bg-[var(--panel-2)] ${
                        isArchived ? 'opacity-80' : 'cursor-pointer'
                      } ${menuOpenId === project.id ? 'z-40' : ''}`}
                    >
                      {/* 顶部：图标 + 标题 + 菜单 */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isArchived ? 'bg-[var(--panel-3)] text-[var(--ink-3)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        }`}>
                          <Film className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-[14px] text-[var(--ink-1)] truncate leading-snug">{project.title}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isArchived ? (
                              <Badge variant="default" className="text-[11px] px-1.5 py-px"><Archive className="w-3 h-3 mr-0.5" />已归档</Badge>
                            ) : (
                              <Badge variant="accent" className="text-[11px] px-1.5 py-px">{getStepLabel(project.pipeline_step)}</Badge>
                            )}
                            <Badge variant="default" className="text-[11px] px-1.5 py-px max-w-[140px] truncate">
                              {getStyleLabel(project)}
                            </Badge>
                          </div>
                        </div>
                        <div className="relative flex-shrink-0">
                          <button
                            type="button"
                            className={`w-8 h-8 rounded-md flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--panel-3)] ${isArchived ? '' : 'opacity-45 hover:opacity-100'} transition-opacity`}
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

                      {/* 进度条（4px） */}
                      {!isArchived && (
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1 h-1 bg-[var(--panel-3)] rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[11px] text-[var(--term-green)] tabular-nums flex-shrink-0">{progress}%</span>
                        </div>
                      )}

                      {/* 底部信息 */}
                      <div className="flex items-center gap-3 text-[12px] text-[var(--ink-3)]">
                        <span className="flex items-center gap-1.5">
                          <Clapperboard className="w-3.5 h-3.5" />
                          {isArchived ? '—' : stats ? `${stats.episodes} 集 · ${stats.shots} 镜` : '统计中...'}
                        </span>
                        {!isArchived && (
                          <span className="flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5" />
                            {stats ? `${stats.videos} 视频` : '—'}
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-1 flex-shrink-0">
                          {formatRelativeTime(project.updated_at)}
                        </span>
                      </div>

                      {!isArchived && (
                        <div className="mt-3 flex items-center gap-1 text-sm text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity">
                          继续制作
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 近 7 天活跃趋势 */}
        <Card className="p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink-1)]">近 7 天项目活跃</h2>
              <p className="text-[11px] text-[var(--ink-3)] mt-0.5">按项目更新时间统计</p>
            </div>
          </div>
          <div className="flex h-40 items-stretch justify-between gap-2">
            {trendData.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-mono text-[var(--ink-2)]">{d.count || ''}</span>
                <div
                  className="w-full max-w-[48px] rounded-t-md bg-[var(--accent)] transition-colors duration-500"
                  style={{ height: `${Math.max(8, (d.count / maxTrend) * 100)}%`, opacity: d.count > 0 ? 1 : 0.15 }}
                >
                  <span className="flex h-full items-start justify-center pt-1 text-[10px] font-bold text-white">{d.count > 0 ? d.count : ''}</span>
                </div>
                <span className="text-[11px] font-mono text-[var(--ink-3)]">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </main>

      {/* 创建项目三步向导 */}
      <ProjectWizard
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        initialMode={wizardInitialMode}
      />

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
            maxLength={PROJECT_NAME_MAX_LENGTH}
            onChange={(e) => setRenameTitle(e.target.value.slice(0, PROJECT_NAME_MAX_LENGTH))}
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
