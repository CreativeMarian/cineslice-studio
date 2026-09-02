// 全自动流水线共享类型

export interface AutoPipelineTask {
  taskId: string;
  projectId: string;
  userId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  currentStage: string;
  stageProgress: Record<string, string>; // stage -> status detail
  error?: string;
  startedAt: string;
  completedAt?: string;
  cancelled?: boolean; // 内存中的取消标记
  resumeFromStage?: string; // 恢复时从哪个阶段开始
}
