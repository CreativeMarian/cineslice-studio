import { NavLink, useParams } from 'react-router-dom';
import {
  Film,
  Users,
  Clapperboard,
  Download,
  ChevronLeft,
  ChevronRight,
  Settings,
  Cpu,
  Home,
  Network,
  Coins,
  Sparkles,
} from 'lucide-react';
import { cn } from '../utils';
import { useUIStore } from '../stores/useUIStore';

const navItems = [
  { path: 'script', label: '剧本', icon: Film, description: '小说/剧集/分镜' },
  { path: 'assets', label: '资产', icon: Users, description: '角色/场景/道具' },
  { path: 'director', label: '导演', icon: Clapperboard, description: '视频生成' },
  { path: 'export', label: '导出', icon: Download, description: '成片导出' },
];

export function Sidebar() {
  const { projectId } = useParams();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-[var(--border)] glass-panel transition-all duration-300 marquee-border marquee-border--pause',
        sidebarCollapsed ? 'w-[68px]' : 'w-[220px]'
      )}
    >
      {/* Logo 区 */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border)]">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center shadow-[0_4px_12px_rgba(43, 116, 245, 0.25)] flex-shrink-0">
            <Film className="w-4.5 h-4.5 text-[var(--on-accent)]" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-bold text-[var(--ink-1)] text-base font-[var(--font-display)] tracking-tight">
              CineSlice
            </span>
          )}
        </NavLink>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors flex-shrink-0"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 阶段导航 */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {!sidebarCollapsed && (
          <p className="text-[10px] font-semibold text-[var(--ink-3)] uppercase tracking-wider px-3 mb-2 mt-2">
            创作阶段
          </p>
        )}
        {navItems.map((item, index) => (
          <NavLink
            key={item.path}
            to={`/projects/${projectId}/${item.path}`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                  : 'text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--ink-1)]',
                sidebarCollapsed && 'justify-center px-0'
              )
            }
            title={sidebarCollapsed ? item.label : undefined}
          >
            <item.icon className={cn(
              'w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110',
            )} />
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="leading-tight">{item.label}</span>
                <span className="text-[10px] text-[var(--ink-3)] leading-tight mt-0.5">{item.description}</span>
              </div>
            )}
            {!sidebarCollapsed && (
              <span className="ml-auto text-[10px] text-[var(--ink-3)] font-mono opacity-50">
                0{index + 1}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 底部链接 */}
      <div className="p-3 border-t border-[var(--border)] space-y-1">
        {!sidebarCollapsed && (
          <p className="text-[10px] font-semibold text-[var(--ink-3)] uppercase tracking-wider px-3 mb-2">
            系统
          </p>
        )}
        <NavLink
          to="/create"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-[var(--panel-2)] text-[var(--accent)]'
                : 'text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--ink-1)]',
              sidebarCollapsed && 'justify-center px-0'
            )
          }
          title={sidebarCollapsed ? '自由创作' : undefined}
        >
          <Sparkles className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>自由创作</span>}
        </NavLink>
        <NavLink
          to="/models"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-[var(--panel-2)] text-[var(--ink-1)]'
                : 'text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--ink-1)]',
              sidebarCollapsed && 'justify-center px-0'
            )
          }
          title={sidebarCollapsed ? '模型配置' : undefined}
        >
          <Cpu className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>模型配置</span>}
        </NavLink>
        <NavLink
          to="/mindmap"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-[var(--panel-2)] text-[var(--ink-1)]'
                : 'text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--ink-1)]',
              sidebarCollapsed && 'justify-center px-0'
            )
          }
          title={sidebarCollapsed ? '项目思维导图' : undefined}
        >
          <Network className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>项目思维导图</span>}
        </NavLink>
        <NavLink
          to="/costs"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-[var(--panel-2)] text-[var(--ink-1)]'
                : 'text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--ink-1)]',
              sidebarCollapsed && 'justify-center px-0'
            )
          }
          title={sidebarCollapsed ? '成本统计' : undefined}
        >
          <Coins className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>成本统计</span>}
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-[var(--panel-2)] text-[var(--ink-1)]'
                : 'text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--ink-1)]',
              sidebarCollapsed && 'justify-center px-0'
            )
          }
          title={sidebarCollapsed ? '设置' : undefined}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>设置</span>}
        </NavLink>
        <NavLink
          to="/"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-control)] text-sm font-medium transition-all duration-200',
            'text-[var(--ink-2)] hover:bg-[var(--panel-2)] hover:text-[var(--ink-1)]',
            sidebarCollapsed && 'justify-center px-0'
          )}
          title={sidebarCollapsed ? '返回首页' : undefined}
        >
          <Home className="w-5 h-5 flex-shrink-0" />
          {!sidebarCollapsed && <span>返回首页</span>}
        </NavLink>
      </div>
    </aside>
  );
}
