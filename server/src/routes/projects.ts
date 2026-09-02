// 项目路由 + 小说/剧集/剧本/分镜（挂在项目下）
// v2.0 - 修复剧集生成质量、chapterRange、文件名编码、错误日志

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import {
  ProjectDAO,
  NovelChapterDAO,
  NovelEpisodeDAO,
} from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { novelUpload } from '../middleware/upload';
import { parseNovel } from '../services/novelParser';
import { aiProxy } from '../services/aiProxy';
import { novelToScriptPrompt } from '../services/prompts/novelToScript';
import { parseAiJson } from '../utils/aiJsonParser';
import { decodeFilename } from '../utils/filename';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

// ============ 项目 CRUD ============

const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  genre: z.string().optional(),
  target_duration: z.enum(['1min', '3min', '5min', '10min']).optional(),
  language: z.string().optional(),
  mode: z.enum(['auto', 'semi-auto']).optional(),
  style_preset_id: z.string().optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  stage: z.enum(['script', 'assets', 'director', 'export']).optional(),
  visual_style_id: z.string().optional(),
  novel_config: z.string().optional(),
  genre: z.string().optional(),
  target_duration: z.enum(['1min', '3min', '5min', '10min']).optional(),
  language: z.string().optional(),
  pipeline_step: z.enum(['novel', 'episodes', 'script', 'shots']).optional(),
  mode: z.enum(['auto', 'semi-auto']).optional(),
  style_preset_id: z.string().optional(),
  model_preferences: z.string().optional(),
});

// 项目列表
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = (req.query.status as string) || 'active';
  const result = ProjectDAO.listByUser(db, req.user.id, page, limit, status);
  res.json({ success: true, data: { items: result.items, total: result.total, page, limit } });
}));

// 创建项目
router.post('/', validateBody(createProjectSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.create(db, { user_id: req.user.id, ...req.body });
  res.json({ success: true, data: project });
}));

// 项目详情
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');
  res.json({ success: true, data: project });
}));

// 更新项目
router.put('/:id', validateBody(updateProjectSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');
  const updated = ProjectDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 删除项目（软删除）
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');
  ProjectDAO.softDelete(db, req.params.id);
  res.json({ success: true, data: { message: '项目已删除' } });
}));

// ============ 小说上传与章节 ============

// 上传小说
router.post('/:id/novel/upload', novelUpload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');
  if (!req.file) {
    console.error('[NovelUpload] req.file 为 undefined，可能是 multipart 解析失败');
    throw createError(400, 'VALIDATION_ERROR', '未收到上传文件，请检查文件格式后重试');
  }

  console.log(`[NovelUpload] 收到文件: originalname="${req.file.originalname}", size=${req.file.size}, path=${req.file.path}`);

  let content: string;
  try {
    content = fs.readFileSync(req.file.path, 'utf-8');
  } catch (readErr: any) {
    console.error('[NovelUpload] 文件读取失败:', readErr.message);
    throw createError(500, 'FILE_READ_ERROR', '文件读取失败，请重试');
  }

  if (!content || !content.trim()) {
    throw createError(400, 'EMPTY_FILE', '文件内容为空');
  }

  let chapters: ReturnType<typeof parseNovel>;
  try {
    chapters = parseNovel(content);
  } catch (parseErr: any) {
    console.error('[NovelUpload] 小说解析失败:', parseErr.message, parseErr.stack);
    throw createError(500, 'PARSE_ERROR', `小说解析失败：${parseErr.message || '未知错误'}`);
  }

  console.log(`[NovelUpload] 解析出 ${chapters.length} 个章节`);

  if (chapters.length === 0) {
    throw createError(400, 'NO_CHAPTERS', '未能从文件中解析出任何章节内容');
  }

  // 修复中文文件名乱码：使用解码后的文件名
  const decodedFileName = decodeFilename(req.file.originalname);

  // 删除旧章节
  NovelChapterDAO.deleteByProject(db, req.params.id);

  // 批量插入新章节
  const chapterData = chapters.map((ch, idx) => ({
    user_id: req.user.id,
    project_id: req.params.id,
    chapter_number: idx + 1,
    title: ch.title,
    content: ch.content,
    source_file: decodedFileName,
  }));
  const created = NovelChapterDAO.batchCreate(db, chapterData);

  // 小说上传成功后，自动推进到剧集生成阶段
  ProjectDAO.update(db, req.params.id, { pipeline_step: 'episodes' });

  console.log(`[NovelUpload] 成功保存 ${created.length} 个章节到项目 ${req.params.id}`);
  res.json({ success: true, data: { chapters: created, total_chapters: created.length } });
}));

// 章节列表
router.get('/:id/chapters', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const chapters = NovelChapterDAO.listByProject(db, req.params.id);
  res.json({ success: true, data: chapters });
}));

// 更新章节
router.put('/:id/chapters/:cid', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const chapter = NovelChapterDAO.getById(db, req.params.cid);
  if (!chapter || chapter.project_id !== req.params.id) throw createError(404, 'NOT_FOUND', '章节不存在');
  const updated = NovelChapterDAO.update(db, req.params.cid, req.body);
  res.json({ success: true, data: updated });
}));

// 合并章节
router.post('/:id/chapters/merge', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const { chapterIds } = req.body;
  if (!Array.isArray(chapterIds) || chapterIds.length < 2) {
    throw createError(400, 'VALIDATION_ERROR', '至少选择2个章节');
  }
  const chapters = NovelChapterDAO.getByIds(db, chapterIds);
  if (chapters.length === 0) throw createError(404, 'NOT_FOUND', '章节不存在');

  const mergedContent = chapters.map(c => c.content).join('\n\n');
  const first = chapters[0];
  const updated = NovelChapterDAO.update(db, first.id, {
    title: first.title,
    content: mergedContent,
  });

  // 删除其他章节
  for (let i = 1; i < chapters.length; i++) {
    NovelChapterDAO.delete(db, chapters[i].id);
  }

  res.json({ success: true, data: updated });
}));

// 拆分章节
router.post('/:id/chapters/:cid/split', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const chapter = NovelChapterDAO.getById(db, req.params.cid);
  if (!chapter) throw createError(404, 'NOT_FOUND', '章节不存在');

  const { splitPosition } = req.body;
  if (typeof splitPosition !== 'number' || splitPosition <= 0 || splitPosition >= chapter.content.length) {
    throw createError(400, 'VALIDATION_ERROR', '拆分位置无效');
  }

  const firstContent = chapter.content.substring(0, splitPosition);
  const secondContent = chapter.content.substring(splitPosition);

  NovelChapterDAO.update(db, chapter.id, { content: firstContent });

  const maxNum = NovelChapterDAO.getMaxChapterNumber(db, req.params.id);
  const newChapter = NovelChapterDAO.create(db, {
    user_id: req.user.id,
    project_id: req.params.id,
    chapter_number: maxNum + 1,
    title: chapter.title + '（下）',
    content: secondContent,
    source_file: chapter.source_file || undefined,
  });

  res.json({ success: true, data: { first: NovelChapterDAO.getById(db, chapter.id), second: newChapter } });
}));

// ============ 剧集与剧本 ============

const generateEpisodesSchema = z.object({
  chapter_ids: z.array(z.string()).optional(),
  provider: z.string(),
  modelName: z.string(),
  episodes_count: z.number().int().min(1).max(50).optional(),
  style: z.string().optional(),
});

// 辅助：规范化 chapterRange，修复 AI 返回的异常值
function normalizeChapterRange(raw: any, episodeNum: number): string {
  if (!raw) return `第${episodeNum}集`;
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/^["']|["']$/g, ''); // 去除多余引号
    if (!trimmed || trimmed === '第1章' || trimmed === '第一章') {
      return `第${episodeNum}集`;
    }
    return trimmed;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    // 数组形式：直接拼接，不用 JSON.stringify（避免多余引号）
    return raw.map((r: any) => String(r)).join(', ');
  }
  return `第${episodeNum}集`;
}

// 辅助：解析 AI 返回的剧集数据，带重试和宽松解析
function parseEpisodesData(rawContent: string): any[] {
  // 第一次尝试：标准解析
  const firstResult = parseAiJson<any>(rawContent);
  if (firstResult.success && firstResult.data) {
    return Array.isArray(firstResult.data) ? firstResult.data : [firstResult.data];
  }

  // 第二次尝试：尝试提取数组部分
  const arrayMatch = rawContent.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const secondResult = parseAiJson<any>(arrayMatch[0]);
    if (secondResult.success && secondResult.data) {
      return Array.isArray(secondResult.data) ? secondResult.data : [secondResult.data];
    }
  }

  // 第三次尝试：尝试提取单个对象
  const objMatch = rawContent.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const thirdResult = parseAiJson<any>(objMatch[0]);
    if (thirdResult.success && thirdResult.data) {
      return Array.isArray(thirdResult.data) ? thirdResult.data : [thirdResult.data];
    }
  }

  // 全部失败，抛出带预览的错误
  const preview = rawContent.length > 2000 ? rawContent.slice(0, 2000) + '...' : rawContent;
  throw new Error(`AI返回内容无法解析为JSON。返回内容预览：\n${preview}`);
}

// 生成剧集
router.post('/:id/episodes/generate', validateBody(generateEpisodesSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const { chapter_ids, provider, modelName, episodes_count, style } = req.body;
  const chapters = chapter_ids && chapter_ids.length > 0
    ? NovelChapterDAO.getByIds(db, chapter_ids)
    : NovelChapterDAO.listByProject(db, req.params.id);

  if (chapters.length === 0) throw createError(400, 'VALIDATION_ERROR', '没有可生成的章节内容');

  const novelContent = chapters.map(c => `【${c.title}】\n${c.content}`).join('\n\n');

  // 判断是否需要分批生成（集数 > 10 或内容过长时）
  const estimatedEpisodes = episodes_count || Math.max(1, Math.ceil(chapters.length / 2));
  const needBatch = estimatedEpisodes > 10 || novelContent.length > 50000;

  let allEpisodesData: any[] = [];

  if (needBatch && episodes_count && episodes_count > 10) {
    // 分批生成：每批5集
    const batchSize = 5;
    const totalBatches = Math.ceil(episodes_count / batchSize);
    console.log(`[GenerateEpisodes] 分批生成模式：共${episodes_count}集，分${totalBatches}批，每批${batchSize}集`);

    for (let batch = 0; batch < totalBatches; batch++) {
      const startEpisode = batch * batchSize + 1;
      const batchCount = Math.min(batchSize, episodes_count - batch * batchSize);
      console.log(`[GenerateEpisodes] 第${batch + 1}/${totalBatches}批：第${startEpisode}-${startEpisode + batchCount - 1}集`);

      const { systemPrompt, prompt } = novelToScriptPrompt({
        novelContent,
        episodesCount: batchCount,
        style,
      });

      // 在 prompt 中追加批次信息
      const batchPrompt = prompt + `\n\n注意：本次只需生成第${startEpisode}到第${startEpisode + batchCount - 1}集（共${batchCount}集），episodeNumber 从${startEpisode}开始编号。`;

      const result = await aiProxy.generateText({
        db, userId: req.user.id, provider, modelName,
        prompt: batchPrompt, systemPrompt, responseFormat: 'json', maxTokens: 32000,
      });

      // 记录 AI 返回内容到日志（前2000字符）
      const contentPreview = result.content.length > 2000 ? result.content.slice(0, 2000) + '...[截断]' : result.content;
      console.log(`[GenerateEpisodes] 第${batch + 1}批 AI返回内容长度: ${result.content.length}, 预览: ${contentPreview}`);

      const batchData = parseEpisodesData(result.content);
      allEpisodesData = allEpisodesData.concat(batchData);
    }
  } else {
    // 单批生成
    const { systemPrompt, prompt } = novelToScriptPrompt({ novelContent, episodesCount: episodes_count, style });

    const result = await aiProxy.generateText({
      db, userId: req.user.id, provider, modelName,
      prompt, systemPrompt, responseFormat: 'json', maxTokens: 32000,
    });

    // 记录 AI 返回内容到日志（前2000字符）
    const contentPreview = result.content.length > 2000 ? result.content.slice(0, 2000) + '...[截断]' : result.content;
    console.log(`[GenerateEpisodes] AI返回内容长度: ${result.content.length}, 预览: ${contentPreview}`);

    allEpisodesData = parseEpisodesData(result.content);
  }

  console.log(`[GenerateEpisodes] 共解析出 ${allEpisodesData.length} 集数据`);

  // 删除旧剧集
  const oldEpisodes = NovelEpisodeDAO.listByProject(db, req.params.id);
  for (const ep of oldEpisodes) NovelEpisodeDAO.delete(db, ep.id);

  // 插入新剧集（含 chapter_range 兜底修复）
  const created = allEpisodesData.map((ep: any, idx: number) => {
    const episodeNum = ep.episodeNumber || idx + 1;
    const chapterRangeVal = normalizeChapterRange(ep.chapterRange, episodeNum);
    return NovelEpisodeDAO.create(db, {
      user_id: req.user.id,
      project_id: req.params.id,
      episode_number: episodeNum,
      title: ep.title || `第${episodeNum}集`,
      chapter_range: chapterRangeVal,
      script_content: ep.scriptContent || '',
      text_model_used: `${provider}/${modelName}`,
    });
  });

  // 按 episode_number 排序
  created.sort((a, b) => a.episode_number - b.episode_number);

  res.json({ success: true, data: created });
}));

// 剧集列表
router.get('/:id/episodes', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const episodes = NovelEpisodeDAO.listByProject(db, req.params.id);
  res.json({ success: true, data: episodes });
}));

// 批量删除剧集
const batchDeleteSchema = z.object({
  episode_ids: z.array(z.string()).min(1),
});
router.post('/:id/episodes/batch-delete', validateBody(batchDeleteSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const { episode_ids } = req.body;
  let deleted = 0;
  for (const epId of episode_ids) {
    const episode = NovelEpisodeDAO.getByIdAndUser(db, epId, req.user.id);
    if (episode && episode.project_id === req.params.id) {
      NovelEpisodeDAO.delete(db, epId);
      deleted++;
    }
  }
  res.json({ success: true, data: { deleted } });
}));

export default router;
