import { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, User, Sun, Moon, ChevronDown, ChevronRight, Home, Sparkles, Search } from 'lucide-react';
import { useProjectStore } from '../stores/useProjectStore';
import { useAuthStore } from '../stores/useAuthStore';
import { useUIStore } from '../stores/useUIStore';
import { useCommandPaletteStore } from '../stores/useCommandPaletteStore';
import { ProfileModal } from './ProfileModal';
import { TaskCenter } from './ui/TaskCenter';
import { Badge } from './ui';

const STAGE_ORDER = ['script', 'assets', 'director', 'export'];
const STAGE_LABELS: Record<string, string> = {
  script: '剧本',
  assets: '资产',
  director: '导演',
  export: '导出',
};

export function Topbar() {
  const [profileOpen, setProfileOpen] = useState(false);
  const { currentProject } = useProjectStore();
  const { user, isLocal } = useAuthStore();
  const { theme, toggleTheme } = useUIStore();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const location = useLocation();

  // 当前阶段
  const currentStage = STAGE_ORDER.find(s => location.pathname.includes(`/${s}`)) || 'script';
  const currentIndex = STAGE_ORDER.indexOf(currentStage);
  const nextStage = currentIndex < STAGE_ORDER.length - 1 ? STAGE_ORDER[currentIndex + 1] : null;

  const stageLabels: Record<string, string> = {
    script: '剧本阶段',
    assets: '资产阶段',
    director: '导演阶段',
    export: '导出阶段',
  };

  return (
    <>
      <header className="h-16 border-b border-[var(--border)] glass-nav flex items-center justify-between px-5 flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors flex-shrink-0"
            title="返回项目列表"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-6 w-px bg-[var(--border)] flex-shrink-0" />

          {/* 面包屑 */}
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <button
              onClick={() => navigate('/')}
              className="p-1 rounded hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors flex-shrink-0"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
            <ChevronRight className="w-3 h-3 text-[var(--ink-3)] flex-shrink-0" />
            <span className="text-[var(--ink-2)] hover:text-[var(--ink-1)] cursor-pointer truncate max-w-[120px] sm:max-w-[200px]" onClick={() => navigate('/')}>
              {currentProject?.title || '项目'}
            </span>
            <ChevronRight className="w-3 h-3 text-[var(--ink-3)] flex-shrink-0" />
            <span className="text-[var(--accent)] font-medium flex-shrink-0">
              {STAGE_LABELS[currentStage] || currentStage}
            </span>
          </div>

          {currentProject && (
            <Badge variant="accent" className="flex-shrink-0 ml-1">{stageLabels[currentProject.stage] || '剧本阶段'}</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* 任务中心 */}
          <TaskCenter />
          {/* 命令面板入口 */}
          <button
            onClick={() => useCommandPaletteStore.getState().openPalette()}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--ink-3)] text-xs hover:border-[var(--border-hover)] hover:text-[var(--ink-1)] transition-colors"
            title="搜索与快捷操作 (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            搜索 / 快捷操作
            <kbd className="px-1 py-0.5 text-[10px] rounded border border-[var(--border)] bg-[var(--panel-2)] font-mono">Ctrl K</kbd>
          </button>
          {/* 下一步引导 */}
          {nextStage && (
            <button
              onClick={() => navigate(`/projects/${projectId}/${nextStage}`)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-medium hover:bg-[var(--accent-soft)]/80 transition-all"
              title={`前往${STAGE_LABELS[nextStage]}阶段`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              下一步：{STAGE_LABELS[nextStage]}
              <ChevronRight className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
            title={theme === 'dark' ? '切换浅色' : '切换深色'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <div className="h-6 w-px bg-[var(--border)] mx-1" />

          {/* 用户菜单 */}
          <button
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-lg hover:bg-[var(--panel-2)] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] flex items-center justify-center flex-shrink-0">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-[var(--on-accent)]" />
              )}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-medium text-[var(--ink-1)] leading-tight">
                {user?.display_name || '本地用户'}
              </p>
              <p className="text-[10px] text-[var(--ink-3)] leading-tight">
                {isLocal ? '本地模式' : user?.username}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-[var(--ink-3)] hidden sm:block" />
          </button>
        </div>
      </header>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
