// 阶段3：剧本生成 — 剧集生成已包含剧本，检查是否有内容
import type { Database } from '../../../types';
import { NovelEpisodeDAO } from '../../../models';
import type { AutoPipelineTask } from '../types';

export async function stageScript(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  const first = episodes[0];
  if (!first || !first.script_content || first.script_content.length < 10) {
    throw new Error('剧本内容为空，请先确保剧集生成包含剧本');
  }
  task.stageProgress['script'] = `剧本长度: ${first.script_content.length} 字`;
}
