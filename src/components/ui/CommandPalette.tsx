// 全局命令面板（Ctrl+K）+ 快捷键帮助（?）
// 搜索项目、导航阶段、执行常用操作
// v1.0

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search, FolderOpen, Wand2, Sun, Moon, BookOpen,
  Keyboard, ArrowRight, LayoutDashboard, Cpu, SlidersHorizontal,
  FileText, Users, Clapperboard, Send, KeyboardIcon, Plus,
} from 'lucide-react';
import { useCommandPaletteStore } from '../../stores/useCommandPaletteStore';
import { useUIStore } from '../../stores/useUIStore';
import { projectService } from '../../services/projectService';
import type { Project } from '../../types';
import { cn } from '../../utils';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  group: '项目' | '阶段导航' | '操作';
  action: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

const STAGE_PATHS = [
  { path: 'script', label: '剧本工作台', icon: <FileText className="w-4 h-4" /> },
  { path: 'assets', label: '资产工坊', icon: <Users className="w-4 h-4" /> },
  { path: 'director', label: '导演工作台', icon: <Clapperboard className="w-4 h-4" /> },
  { path: 'export', label: '成片出口', icon: <Send className="w-4 h-4" /> },
];

export function CommandPalette() {
  const { open, view, close, openHelp } = useCommandPaletteStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme, showToast } = useUIStore();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 当前是否处于项目内（用于展示阶段导航）
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const currentProjectId = projectMatch ? projectMatch[1] : null;

  // 打开时拉取项目列表并聚焦
  useEffect(() => {
    if (open && view === 'commands') {
      setQuery('');
      setActiveIndex(0);
      projectService.list({ limit: 15 })
        .then((res) => setProjects(res.success && res.data ? res.data.items || [] : []))
        .catch(() => setProjects([]));
      // 等待挂载后聚焦
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, view]);

  // 全局快捷键
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useCommandPaletteStore.getState().toggle();
        return;
      }
      if (!isTypingTarget(e.target) && e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openHelp();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openHelp]);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // 项目内：阶段导航
    if (currentProjectId) {
      for (const stage of STAGE_PATHS) {
        items.push({
          id: `stage-${stage.path}`,
          label: stage.label,
          hint: '阶段导航',
          icon: stage.icon,
          keywords: 'stage 剧本 资产 导演 成片',
          group: '阶段导航',
          action: () => navigate(`/projects/${currentProjectId}/${stage.path}`),
        });
      }
    }

    // 项目列表
    for (const p of projects) {
      items.push({
        id: `project-${p.id}`,
        label: p.title,
        hint: p.description || '打开项目',
        icon: <FolderOpen className="w-4 h-4" />,
        keywords: 'project 项目',
        group: '项目',
        action: () => navigate(`/projects/${p.id}`),
      });
    }

    // 全局操作
    items.push(
      {
        id: 'action-dashboard',
        label: '打开项目仪表盘',
        icon: <LayoutDashboard className="w-4 h-4" />,
        keywords: 'dashboard home 仪表盘 首页',
        group: '操作',
        action: () => navigate('/'),
      },
      {
        id: 'action-new-project',
        label: '新建项目',
        icon: <Plus className="w-4 h-4" />,
        keywords: 'create new 新建 创建 项目',
        group: '操作',
        action: () => {
          navigate('/?action=new');
        },
      },
      {
        id: 'action-models',
        label: '模型配置',
        icon: <Cpu className="w-4 h-4" />,
        keywords: 'model config 模型 配置 api',
        group: '操作',
        action: () => navigate('/models'),
      },
      {
        id: 'action-mindmap',
        label: '制作流程图',
        icon: <BookOpen className="w-4 h-4" />,
        keywords: 'mindmap flow 流程 图',
        group: '操作',
        action: () => navigate('/mindmap'),
      },
      {
        id: 'action-settings',
        label: '设置',
        icon: <SlidersHorizontal className="w-4 h-4" />,
        keywords: 'settings 设置 偏好',
        group: '操作',
        action: () => navigate('/settings'),
      },
      {
        id: 'action-theme',
        label: theme === 'dark' ? '切换到浅色主题' : '切换到深色主题',
        icon: theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
        keywords: 'theme dark light 主题 深色 浅色',
        group: '操作',
        action: () => {
          toggleTheme();
          showToast('主题已切换', 'success');
        },
      },
      {
        id: 'action-help',
        label: '查看快捷键',
        hint: '?',
        icon: <Keyboard className="w-4 h-4" />,
        keywords: 'shortcut help 快捷键 帮助',
        group: '操作',
        action: () => openHelp(),
      },
    );
    return items;
  }, [currentProjectId, projects, theme, navigate, toggleTheme, showToast, openHelp]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) || (c.keywords || '').toLowerCase().includes(q)
    );
  }, [commands, query]);

  // 过滤结果变化时重置选中
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 键盘导航
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) {
        close();
        item.action();
      }
    } else if (e.key === 'Escape') {
      close();
    }
  };

  // 选中项滚动到可视区
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  // ---------- 快捷键帮助视图 ----------
  if (view === 'help') {
    const shortcuts: Array<[string, string]> = [
      ['Ctrl / ⌘ + K', '打开命令面板（搜索项目、跳转、执行操作）'],
      ['?', '打开快捷键帮助'],
      ['Esc', '关闭弹窗 / 面板'],
      ['↑ / ↓ + Enter', '在命令面板中选择并执行'],
      ['Ctrl / ⌘ + Enter', '在剧本编辑、模型弹窗中快速保存'],
    ];
    return (
      <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
        <div className="relative w-full max-w-md bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-float)] overflow-hidden animate-slide-up">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
            <KeyboardIcon className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="font-semibold text-[var(--ink-1)]">快捷键</h3>
            <button className="ml-auto text-xs text-[var(--ink-3)] hover:text-[var(--ink-1)]" onClick={close}>
              Esc 关闭
            </button>
          </div>
          <div className="p-4 space-y-2">
            {shortcuts.map(([keys, desc]) => (
              <div key={keys} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--panel-2)]">
                <span className="text-sm text-[var(--ink-2)]">{desc}</span>
                <kbd className="px-2 py-0.5 text-xs rounded-md border border-[var(--border)] bg-[var(--panel-2)] text-[var(--ink-1)] font-mono">
                  {keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- 命令面板视图 ----------
  const groups: CommandItem['group'][] = ['阶段导航', '项目', '操作'];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-xl bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-float)] overflow-hidden animate-slide-up">
        {/* 搜索输入 */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
          <Search className="w-5 h-5 text-[var(--ink-3)] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="搜索项目、跳转阶段、执行操作..."
            className="flex-1 bg-transparent outline-none text-[var(--ink-1)] placeholder:text-[var(--ink-4)] text-sm"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] rounded border border-[var(--border)] bg-[var(--panel-2)] text-[var(--ink-3)] font-mono">
            Esc
          </kbd>
        </div>

        {/* 命令列表 */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--ink-3)]">
              没有匹配的命令或项目
            </div>
          ) : (
            groups.map((group) => {
              const groupItems = filtered
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => item.group === group);
              if (groupItems.length === 0) return null;
              return (
                <div key={group} className="mb-1">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                    {group}
                  </div>
                  {groupItems.map(({ item, idx }) => {
                    return (
                      <button
                        key={item.id}
                        data-index={idx}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                          idx === activeIndex
                            ? 'bg-[var(--accent-soft)] text-[var(--ink-1)]'
                            : 'text-[var(--ink-2)] hover:bg-[var(--panel-2)]'
                        )}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          close();
                          item.action();
                        }}
                      >
                        <span className={cn(
                          'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                          idx === activeIndex ? 'text-[var(--accent)]' : 'text-[var(--ink-3)]'
                        )}>
                          {item.icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{item.label}</span>
                          {item.hint && (
                            <span className="block text-xs text-[var(--ink-3)] truncate">{item.hint}</span>
                          )}
                        </span>
                        {idx === activeIndex && (
                          <ArrowRight className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-4 text-[10px] text-[var(--ink-4)]">
          <span className="flex items-center gap-1"><Wand2 className="w-3 h-3" /> CineSlice 命令面板</span>
          <span className="ml-auto flex items-center gap-2">
            <kbd className="px-1 py-0.5 rounded border border-[var(--border)] font-mono">↑↓</kbd> 选择
            <kbd className="px-1 py-0.5 rounded border border-[var(--border)] font-mono">Enter</kbd> 执行
          </span>
        </div>
      </div>
    </div>
  );
}
