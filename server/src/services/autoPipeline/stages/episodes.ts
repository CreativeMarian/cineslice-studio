// 阶段2：剧集拆分 — 从章节生成剧集（含剧本）
import type { Database } from '../../../types';
import { NovelChapterDAO, NovelEpisodeDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { novelToScriptPrompt } from '../../prompts/novelToScript';
import { parseAiJsonOrThrow, parseAiJson } from '../../../utils/aiJsonParser';
import type { AutoPipelineTask } from '../types';
import { getFirstModel } from '../helpers';

export async function stageEpisodes(db: Database, task: AutoPipelineTask): Promise<void> {
  const existing = NovelEpisodeDAO.listByProject(db, task.projectId);
  if (existing.length > 0) {
    task.stageProgress['episodes'] = `已存在 ${existing.length} 集，跳过`;
    return;
  }

  const model = getFirstModel(db, task.userId, 'text');
  if (!model) throw new Error('请先配置文本模型');

  const chapters = NovelChapterDAO.listByProject(db, task.projectId);
  const allContent = chapters.map(c => c.content).join('\n\n');

  const { systemPrompt, prompt } = novelToScriptPrompt({
    novelContent: allContent,
    episodesCount: 1,
  });

  const result = await aiProxy.generateText({
    db, userId: task.userId, provider: model.provider, modelName: model.modelName,
    prompt, systemPrompt, responseFormat: 'json', maxTokens: 16000,
  });

  let data: any;
  try {
    data = parseAiJsonOrThrow<any>(result.content);
    if (Array.isArray(data)) data = data[0];
  } catch {
    const loose = parseAiJson<any>(result.content);
    if (loose.success && loose.data) {
      data = Array.isArray(loose.data) ? loose.data[0] : loose.data;
    } else {
      throw new Error('AI 返回内容解析失败');
    }
  }

  const episode = NovelEpisodeDAO.create(db, {
    user_id: task.userId,
    project_id: task.projectId,
    episode_number: 1,
    title: data.title || '第1集',
    script_content: data.scriptContent || allContent,
    chapter_range: '1-1',
    theme: data.theme || undefined,
    characters_json: data.characters ? JSON.stringify(data.characters) : undefined,
    key_items_json: data.keyItems ? JSON.stringify(data.keyItems) : undefined,
    text_model_used: `${model.provider}/${model.modelName}`,
  });

  task.stageProgress['episodes'] = `生成 1 集: ${episode.title}`;
}
