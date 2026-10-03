// 阶段2：剧集拆分 — 从章节生成剧集（含剧本）
import type { Database } from '../../../types';
import { NovelChapterDAO, NovelEpisodeDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { buildNovelToScriptPrompt } from '../../prompts/novelToScript';
import { parseAiJsonOrThrow, parseAiJson } from '../../../utils/aiJsonParser';
import type { AutoPipelineTask } from '../types';
import { getFirstModel, withRetry } from '../helpers';
import { applyStageRules } from '../../stageSkills';

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

  const prompt = buildNovelToScriptPrompt(allContent);
  const systemPrompt = applyStageRules('', 'episodes');

  const result = await withRetry(
    () => aiProxy.generateText({
      db, userId: task.userId, provider: model.provider, modelName: model.modelName,
      prompt, systemPrompt, responseFormat: 'json', maxTokens: 16000,
    }),
    { maxAttempts: 3, label: '剧集拆分AI调用' }
  );

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

  // shuohao novel-script 结构化剧本 → 纯文本剧本（兼容旧字段 script_content）
  // 提示词输出：{ episode_title, total_duration_seconds, scenes: [{ scene_name, location, time_of_day, beats: [{type, character?, content}] }] }
  function structuredScriptToText(obj: any): string {
    if (!obj) return '';
    // 如果 AI 直接返回了纯文本字段，优先使用
    if (obj.scriptContent || obj.script_content || obj.content) {
      return obj.scriptContent || obj.script_content || obj.content;
    }
    const scenes = obj.scenes || obj.sceneList || [];
    if (!Array.isArray(scenes) || scenes.length === 0) return '';
    const lines: string[] = [];
    if (obj.episode_title) lines.push(`【${obj.episode_title}】`, '');
    for (const sc of scenes) {
      const sceneHeader = [sc.scene_name || sc.sceneName, sc.location ? `（${sc.location}${sc.time_of_day ? '，' + sc.time_of_day : ''}）` : ''].filter(Boolean).join(' ');
      if (sceneHeader) lines.push(`场景：${sceneHeader}`);
      const beats = sc.beats || sc.beatList || [];
      for (const b of beats) {
        if (!b || !b.content) continue;
        if (b.type === 'dialogue' && b.character) {
          lines.push(`${b.character}：${b.content}`);
        } else {
          lines.push(b.content);
        }
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  const scriptText = structuredScriptToText(data) || allContent;
  const episodeTitle = data.episode_title || data.title || data.episodeTitle || '第1集';

  const episode = NovelEpisodeDAO.create(db, {
    user_id: task.userId,
    project_id: task.projectId,
    episode_number: 1,
    title: episodeTitle,
    script_content: scriptText,
    chapter_range: '1-1',
    theme: data.theme || undefined,
    characters_json: data.characters ? JSON.stringify(data.characters) : undefined,
    key_items_json: data.keyItems ? JSON.stringify(data.keyItems) : undefined,
    text_model_used: `${model.provider}/${model.modelName}`,
  });

  task.stageProgress['episodes'] = `生成 1 集: ${episode.title}`;
}
