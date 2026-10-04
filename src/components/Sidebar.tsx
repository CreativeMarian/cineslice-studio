import { useEffect, useState } from 'react';
import { Link, NavLink, useParams, useLocation } from 'react-router-dom';
import {
  Film,
  ClipboardList,
  Users,
  Palette,
  FileText,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  Settings,
  Cpu,
  Home,
  CheckCircle2,
} from 'lucide-react';
import { cn, getPipelineStageFromPath, isPipelineStageDone } from '../utils';
import { useUIStore } from '../stores/useUIStore';
import { pipelineService, type ProjectProgressData } from '../services/pipelineService';

// 五段管线导航（shuohao-skills 对齐）
const STAGE_NAV = [
  { key: 'outline', label: '项目大纲', path: '', icon: ClipboardList, description: '小说上传 · 大纲五件套' },
  { key: 'characters', label: '角色设定', path: 'characters', icon: Users, description: '角色提取 · 定妆照' },
  { key: 'art', label: '美术设定', path: 'art', icon: Palette, description: '场景 · 道具' },
  { key: 'script', label: '剧本', path: 'script', icon: FileText, description: '场次流 · 台词本' },
  { key: 'director', label: '导演台', path: 'director', icon: Clapperboard, description: '分镜 · 视频 · 导出' },
];

const ITEM_BASE =
  'flex items-center gap-3 h-8 rounded-md text-[13px] font-medium transition-colors duration-150 ease-out';
const ITEM_IDLE = 'text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--ink-1)]';
const ITEM_ACTIVE =
  'bg-[var(--panel-2)] text-[var(--ink-1)] shadow-[inset_2px_0_0_var(--accent)]';

export function Sidebar() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const [progress, setProgress] = useState<ProjectProgressData | null>(null);

  // 真实数据完成度：驱动各阶段 ✅ 标记（与进度条一致）
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    pipelineService.getProgress(id)
      .then(res => { if (!cancelled && res.success && res.data) setProgress(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  const activeStage = getPipelineStageFromPath(pathname);

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-[var(--border)] bg-[var(--bg)] transition-[width] duration-200 ease-out flex-shrink-0',
        sidebarCollapsed ? 'w-[64px]' : 'w-[240px]'
      )}
    >
      {/* Logo 区 */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--border)] flex-shrink-0">
        <NavLink to="/" className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <Film className="w-4 h-4 text-[var(--on-accent)]" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-semibold text-[var(--ink-1)] text-sm font-[var(--font-display)] tracking-tight truncate">
              CineSlice
            </span>
          )}
        </NavLink>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors flex-shrink-0"
          title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 五段管线导航 */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {!sidebarCollapsed && (
          <p className="text-[10px] font-semibold text-[var(--ink-3)] uppercase tracking-wider px-3 mb-1.5 mt-1">
            创作管线
          </p>
        )}
        {STAGE_NAV.map((item) => {
          const done = isPipelineStageDone(item.key, progress);
          const active = activeStage === item.key;
          return (
            <Link
              key={item.key}
              to={item.path ? `/project/${id}/${item.path}` : `/project/${id}`}
              className={cn(
                ITEM_BASE,
                active ? ITEM_ACTIVE : ITEM_IDLE,
                sidebarCollapsed && 'justify-center px-0'
              )}
              title={sidebarCollapsed ? item.label : item.description}
            >
              <item.icon className={cn(
                'w-4 h-4 flex-shrink-0',
                active && 'text-[var(--accent)]'
              )} />
              {!sidebarCollapsed && (
                <span className="flex-1 truncate">{item.label}</span>
              )}
              {!sidebarCollapsed && done && (
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] ml-auto flex-shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* 系统链接 */}
      <div className="p-2.5 border-t border-[var(--border)] space-y-0.5 flex-shrink-0">
        {!sidebarCollapsed && (
          <p className="text-[10px] font-semibold text-[var(--ink-3)] uppercase tracking-wider px-3 mb-1.5">
            系统
          </p>
        )}
        <NavLink
          to="/models"
          className={({ isActive }) =>
            cn(
              ITEM_BASE,
              isActive ? ITEM_ACTIVE : ITEM_IDLE,
              sidebarCollapsed && 'justify-center px-0'
            )
          }
          title={sidebarCollapsed ? '模型配置' : undefined}
        >
          <Cpu className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>模型配置</span>}
        </NavLink>
        <NavLink
          to={`/project/${id}/settings`}
          className={({ isActive }) =>
            cn(
              ITEM_BASE,
              isActive ? ITEM_ACTIVE : ITEM_IDLE,
              sidebarCollapsed && 'justify-center px-0'
            )
          }
          title={sidebarCollapsed ? '项目设置' : undefined}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>项目设置</span>}
        </NavLink>
        <NavLink
          to="/"
          className={cn(
            ITEM_BASE,
            ITEM_IDLE,
            sidebarCollapsed && 'justify-center px-0'
          )}
          title={sidebarCollapsed ? '返回首页' : undefined}
        >
          <Home className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && <span>返回首页</span>}
        </NavLink>
      </div>
    </aside>
  );
}
