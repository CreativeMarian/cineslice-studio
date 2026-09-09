// 阶段10：拼接成片（export）—— 对每集执行两级合成（阶段视频 → 整集）
// v1.0 - 全自动流水线收尾阶段：依赖 composeEpisode(byPhase) 与持久化日志
import type { Database } from '../../../types';
import { NovelEpisodeDAO } from '../../../models';
import { composeEpisode, getComposeStatus } from '../../videoComposer';
import type { AutoPipelineTask } from '../types';
import { saveTask } from '../taskStore';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function stageExport(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  if (episodes.length === 0) {
    task.stageProgress['export'] = '无剧集，跳过';
    return;
  }

  let done = 0;
  for (const ep of episodes) {
    const result = await composeEpisode(db, ep.id, task.userId, {
      byPhase: true,
      transition: 'fade',
      transitionDuration: 0.5,
      skipMissingClips: true,
    });
    // composeEpisode 异步执行，轮询等待终态（内存任务表 + 持久化日志）
    const timeoutMs = 60 * 60 * 1000;
    const startedAt = Date.now();
    let status = result.status;
    let lastError: string | undefined;
    while (Date.now() - startedAt < timeoutMs) {
      const s = getComposeStatus(result.taskId);
      status = s?.status || status;
      lastError = s?.error || lastError;
      if (status === 'completed' || status === 'failed') break;
      await sleep(5000);
      task.stageProgress['export'] = `剧集 ${ep.episode_number} 合成中（${status}）`;
      saveTask(db, task);
    }
    if (status !== 'completed') {
      throw new Error(lastError || `剧集 ${ep.episode_number} 合成超时或失败`);
    }
    done++;
    task.stageProgress['export'] = `剧集 ${ep.episode_number} 已拼接完成（${done}/${episodes.length}）`;
    saveTask(db, task);
  }
}
