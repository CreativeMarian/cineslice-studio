import { useEffect, useState, useCallback } from 'react';
import { Outlet, useParams, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ProgressSteps } from './common';
import { useProjectStore } from '../stores/useProjectStore';
import { useUIStore } from '../stores/useUIStore';
import { LoadingState } from './ui';
import { pipelineService, type ProjectProgressData } from '../services/pipelineService';
import { getPipelineStageIndex, PIPELINE_STAGE_GROUPS, isPipelineStageDone } from '../utils';

export function ProjectLayout() {
  const { id } = useParams();
  const location = useLocation();
  const { currentProject, isLoading, loadProjectData, clear } = useProjectStore();
  const { setSidebarCollapsed } = useUIStore();
  const [progress, setProgress] = useState<ProjectProgressData | null>(null);

  // 真实数据完成度：驱动侧边栏 ✅ 与顶部五段进度条（手动操作也生效）
  const loadProgress = useCallback(async () => {
    if (!id) return;
    try {
      const res = await pipelineService.getProgress(id);
      if (res.success && res.data) setProgress(res.data);
    } catch { /* 静默 */ }
  }, [id]);

  // 移动端默认折叠侧边栏
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, [setSidebarCollapsed]);

  useEffect(() => {
    if (id) {
      loadProjectData(id);
      loadProgress();
    }
    return () => {
      clear();
    };
  }, [id, loadProjectData, clear, loadProgress]);

  if (isLoading && !currentProject) {
    return <LoadingState message="加载项目..." />;
  }

  // 当前管线段索引（0-4）与五段完成状态
  const current = Math.min(Math.max(getPipelineStageIndex(location.pathname), 0), PIPELINE_STAGE_GROUPS.length - 1);
  const completed = PIPELINE_STAGE_GROUPS.map((g) => isPipelineStageDone(g.key, progress));

  return (
    <div className="h-screen flex bg-[var(--page)] overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar />
        {/* 五段进度指示器 */}
        <ProgressSteps current={current} completed={completed} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
