// 任务中心：Topbar 铃铛角标 + 右侧抽屉，统一展示 AI 生成任务进度
// v1.0

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, Loader2, CheckCircle2, XCircle, Ban, RefreshCw, Inbox } from 'lucide-react';
import { useTaskStore } from '../../stores/useTaskStore';
import { useUIStore } from '../../stores/useUIStore';
import { Button, Badge } from '.';
import { cn } from '../../utils';
import type { GenerationTask, TaskStatus } from '../../types';

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    text: '文本', script: '剧本', image: '图像', keyframe: '关键帧',
    video: '视频', audio: '音频', tts: '配音',
  };
  return map[type] || type;
}

function statusView(status: TaskStatus): { label: string; icon: React.ReactNode; className: string } {
  switch (status) {
    case 'running':
      return { label: '进行中', icon: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />, className: 'text-blue-400' };
    case 'pending':
      return { label: '等待中', icon: <Loader2 className="w-4 h-4 text-[var(--ink-3)]" />, className: 'text-[var(--ink-3)]' };
    case 'completed':
      return { label: '已完成', icon: <CheckCircle2 className="w-4 h-4 text-green-400" />, className: 'text-green-400' };
    case 'failed':
      return { label: '失败', icon: <XCircle className="w-4 h-4 text-red-400" />, className: 'text-red-400' };
    case 'cancelled':
      return { label: '已取消', icon: <Ban className="w-4 h-4 text-[var(--ink-3)]" />, className: 'text-[var(--ink-3)]' };
    default:
      return { label: status, icon: <Loader2 className="w-4 h-4" />, className: '' };
  }
}

export function TaskCenter() {
  const [open, setOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { tasks, loadTasks, cancelTask } = useTaskStore();
  const { showToast } = useUIStore();
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadTasks();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadTasks]);

  const activeCount = tasks.filter((t) => t.status === 'running' || t.status === 'pending').length;

  // 挂载后拉取一次，用于角标展示
  useEffect(() => {
    loadTasks();
    // 定期刷新角标（轻量接口，20s 一次）
    const timer = setInterval(() => { loadTasks(); }, 20_000);
    return () => clearInterval(timer);
  }, [loadTasks]);

  // 抽屉打开时加速轮询；关闭时停止
  useEffect(() => {
    if (open) {
      refresh();
      pollTimerRef.current = setInterval(() => { loadTasks(); }, 3_000);
      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
  }, [open, refresh, loadTasks]);

  const handleCancel = async (task: GenerationTask) => {
    try {
      await cancelTask(task.id);
      showToast('任务已取消', 'success');
    } catch {
      showToast('取消失败', 'error');
    }
  };

  const sorted = [...tasks].sort((a, b) => {
    const rank = (s: string) => (s === 'running' ? 0 : s === 'pending' ? 1 : s === 'failed' ? 2 : 3);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const visible = sorted.slice(0, 30);

  return (
    <>
      {/* 铃铛按钮 */}
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
        title="任务中心"
      >
        <Bell className="w-5 h-5" />
        {activeCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">
            {activeCount > 99 ? '99+' : activeCount}
          </span>
        )}
      </button>

      {/* 抽屉 */}
      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--bg)] border-l border-[var(--border)] shadow-2xl flex flex-col animate-slide-in-right">
            {/* 头部 */}
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
              <Bell className="w-5 h-5 text-[var(--accent)]" />
              <h3 className="font-semibold text-[var(--ink-1)]">任务中心</h3>
              {activeCount > 0 && (
                <Badge variant="accent" className="ml-1">{activeCount} 个进行中</Badge>
              )}
              <button
                onClick={refresh}
                className="ml-auto p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                title="刷新"
              >
                <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] text-sm"
              >
                ✕
              </button>
            </div>

            {/* 任务列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Inbox className="w-10 h-10 text-[var(--ink-4)] mb-3" />
                  <p className="text-sm text-[var(--ink-3)]">暂无生成任务</p>
                  <p className="text-xs text-[var(--ink-4)] mt-1">启动流水线或生成图片后，进度会显示在这里</p>
                </div>
              ) : (
                visible.map((task) => {
                  const sv = statusView(task.status);
                  const isActive = task.status === 'running' || task.status === 'pending';
                  return (
                    <div
                      key={task.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)]/40 p-3.5"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={cn('flex-shrink-0', sv.className)}>{sv.icon}</span>
                        <span className="text-sm font-medium text-[var(--ink-1)]">
                          {typeLabel(String(task.task_type))}生成任务
                        </span>
                        <span className={cn('text-xs ml-auto flex-shrink-0', sv.className)}>{sv.label}</span>
                      </div>
                      {isActive && (
                        <div className="h-1.5 bg-[var(--bg)] rounded-full overflow-hidden mb-2">
                          <div
                            className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] rounded-full transition-all"
                            style={{ width: `${Math.max(5, Math.min(95, task.progress || 0))}%` }}
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
                        <span className="truncate">
                          {task.model_used || task.error_message || task.completed_at || task.created_at || ''}
                        </span>
                        {isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleCancel(task)}
                          >
                            取消
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
