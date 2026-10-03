import { useState } from 'react';
import { Film, ChevronDown } from 'lucide-react';
import { useProjectStore } from '../../stores/useProjectStore';
import { cn } from '../../utils';

export interface EpisodeSelectorProps {
  className?: string;
}

/** 集数选择器：从 StageAssets 抽取的通用组件，内部使用 useProjectStore 切换当前剧集 */
export function EpisodeSelector({ className }: EpisodeSelectorProps) {
  const { episodes, currentEpisodeId, setCurrentEpisode } = useProjectStore();
  const [open, setOpen] = useState(false);

  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId);

  return (
    <div className={cn('relative', className)}>
      <button
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--panel-2)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors text-sm"
        onClick={() => setOpen(!open)}
      >
        <Film className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-[var(--ink-1)] font-medium">
          {currentEpisode ? `第${currentEpisode.episode_number}集 · ${currentEpisode.title}` : '选择剧集'}
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--ink-3)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-72 max-h-80 overflow-y-auto rounded-lg bg-[var(--bg)] border border-[var(--border)] shadow-xl z-20">
            {episodes.length === 0 ? (
              <div className="p-4 text-sm text-[var(--ink-3)] text-center">暂无剧集，请先生成剧集</div>
            ) : (
              episodes.map((ep) => (
                <button
                  key={ep.id}
                  className={`w-full text-left px-3 py-2.5 hover:bg-[var(--panel-2)] transition-colors border-b border-[var(--border)]/50 last:border-0 ${ep.id === currentEpisodeId ? 'bg-[var(--accent-soft)]/50' : ''}`}
                  onClick={() => {
                    setCurrentEpisode(ep.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ep.id === currentEpisodeId ? 'bg-[var(--accent)] text-white' : 'bg-[var(--panel-2)] text-[var(--ink-2)]'}`}>
                      第{ep.episode_number}集
                    </span>
                    <span className="text-sm text-[var(--ink-1)] truncate flex-1">{ep.title}</span>
                  </div>
                  {ep.script_content && (
                    <p className="text-xs text-[var(--ink-3)] mt-1 truncate">{ep.script_content.slice(0, 50)}...</p>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
