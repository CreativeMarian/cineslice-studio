// 阶段1：小说上传 — 检查是否已有章节
import type { Database } from '../../../types';
import { NovelChapterDAO } from '../../../models';
import type { AutoPipelineTask } from '../types';

export async function stageNovel(db: Database, task: AutoPipelineTask): Promise<void> {
  const chapters = NovelChapterDAO.listByProject(db, task.projectId);
  if (chapters.length === 0) {
    throw new Error('请先上传小说文件并解析章节');
  }
  task.stageProgress['novel'] = `${chapters.length} 个章节`;
}
