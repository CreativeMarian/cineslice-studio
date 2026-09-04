// 视频任务结果卡片（共享）：轮询状态 + 播放 + 失败重试提示
import { useEffect, useState, useCallback, useRef } from 'react';
import { Film, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { createService, type VideoGenResult } from '../../services/createService';

interface VideoResultCardProps {
  task: VideoGenResult;
  provider: string;
  modelName: string;
  onStatusChange: (result: VideoGenResult) => void;
}

export function VideoResultCard({ task, provider, modelName, onStatusChange }: VideoResultCardProps) {
  const [polling, setPolling] = useState(task.status === 'pending' || task.status === 'processing');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPolling(false);
  }, []);

  useEffect(() => {
    if (task.status === 'completed' || task.status === 'failed') {
      stopPolling();
      return;
    }
    if (!polling) return;
    timerRef.current = setInterval(async () => {
      try {
        const res = await createService.getVideoStatus({ provider, modelName, taskId: task.taskId });
        if (res.data) onStatusChange(res.data);
        if (res.data?.status === 'completed' || res.data?.status === 'failed') stopPolling();
      } catch {
        // 轮询失败静默，等待下一次
      }
    }, 6000);
    return stopPolling;
  }, [polling, task.status, task.taskId, provider, modelName, onStatusChange, stopPolling]);

  // 生成中
  if (task.status === 'pending' || task.status === 'processing') {
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--panel-2)]">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-[3px] border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-medium text-[var(--ink-2)] flex items-center gap-2">
            <Film className="w-4 h-4" /> 视频生成中…
            <span className="text-[10px] text-[var(--ink-3)]">
              {task.status === 'processing' ? '画面合成' : '排队中'}
            </span>
          </div>
          <button
            onClick={stopPolling}
            className="text-[10px] text-[var(--ink-3)] underline hover:text-[var(--accent)]"
          >
            停止自动刷新（手动刷新可点右侧按钮）
          </button>
        </div>
      </div>
    );
  }

  // 失败
  if (task.status === 'failed') {
    return (
      <div className="aspect-video rounded-xl overflow-hidden border border-red-500/30 bg-red-500/5 flex flex-col items-center justify-center gap-2 p-4">
        <XCircle className="w-8 h-8 text-red-500" />
        <p className="text-xs text-red-500 font-medium">生成失败</p>
        {task.error && <p className="text-[10px] text-[var(--ink-3)] text-center max-w-full break-all">{task.error}</p>}
      </div>
    );
  }

  // 成功
  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--panel-2)]">
      {task.videoUrl ? (
        <video src={task.videoUrl} controls autoPlay={false} loop className="w-full aspect-video bg-black" />
      ) : (
        <div className="aspect-video flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 text-[var(--ink-3)]" />
          <p className="text-xs text-[var(--ink-3)]">视频 URL 尚未返回</p>
        </div>
      )}
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-[10px] text-[var(--ink-2)] flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" /> 已生成 · {provider}/{modelName}
        </span>
        <a
          href={task.videoUrl}
          download
          className="text-[10px] text-[var(--accent)] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          下载
        </a>
      </div>
    </div>
  );
}
