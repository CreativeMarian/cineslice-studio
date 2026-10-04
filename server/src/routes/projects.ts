// 项目路由 + 小说/剧集/剧本/分镜（挂在项目下）
// v2.0 - 修复剧集生成质量、chapterRange、文件名编码、错误日志

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import {
  ProjectDAO,
  NovelChapterDAO,
  NovelEpisodeDAO,
  ModelRegistryDAO,
  UserPreferenceDAO,
} from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { ErrorCodes } from '../errors';
import { validateBody } from '../middleware/validate';
import { novelUpload } from '../middleware/upload';
import { parseNovel } from '../services/novelParser';
import { projectStorage } from '../services/projectStorage';
import { decodeFilename } from '../utils/filename';
import { rewriteScriptByMode, splitScriptToEpisodes } from '../services/scriptRewriter';
import type { ScriptRewriteOptions } from '../services/scriptRewriter';
import { getScriptRewritePrompt } from '../services/promptPreviewService';
import {
  detectMaxEpisodeMark,
  calcBatchSize,
  selectChaptersForRange,
  generateEpisodeBatch,
} from '../services/episodeGenerationService';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

// shuohao novel-script 结构化剧本 → 纯文本剧本（兼容旧字段 script_content）
function structuredScriptToText(obj: any): string {
  if (!obj) return '';
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

// ============ 项目 CRUD ============

const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  genre: z.string().optional(),
  target_duration: z.enum(['1min', '3min', '5min', '10min']).optional(),
  default_shot_duration: z.number().int().min(5).max(60).optional(),
  language: z.string().optional(),
  mode: z.enum(['auto', 'semi-auto']).optional(),
  style_description: z.string().optional(),
  // P0 身份锁：创建时锁定，不可编辑
  visual_style: z.string().optional(),
  aspect_ratio: z.string().optional(),
  input_mode: z.enum(['one_liner', 'outline', 'novel']).optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  stage: z.enum(['script', 'assets', 'director', 'export']).optional(),
  visual_style_id: z.string().optional(),
  novel_config: z.string().optional(),
  genre: z.string().optional(),
  target_duration: z.enum(['1min', '3min', '5min', '10min']).optional(),
  default_shot_duration: z.number().int().min(5).max(60).optional(),
  language: z.string().optional(),
  pipeline_step: z.enum(['novel', 'episodes', 'script', 'shots']).optional(),
  mode: z.enum(['auto', 'semi-auto']).optional(),
  style_description: z.string().optional(),
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

// ============ 输入模式创建项目（一句话创意/大纲/小说 → 剧本 → 项目+剧集） ============

const fromInputSchema = z.object({
  input_mode: z.enum(['one_liner', 'outline', 'novel']),
  content: z.string().min(1).max(200000),
  title: z.string().min(1).max(200).optional(),
  visual_style: z.string().optional(),
  aspect_ratio: z.string().optional(),
  target_episodes: z.number().int().min(1).max(50).optional(),
  provider: z.string().optional(),
  modelName: z.string().optional(),
  style: z.string().optional(),
  pacing: z.string().optional(),
  // 自定义改写提示词：有值时代替系统自动构建的改写提示词
  custom_prompt: z.string().optional(),
});

// 剧本改写提示词预览 schema（不调用AI，只基于输入+项目配置构建提示词字符串）
const previewScriptPromptSchema = z.object({
  input: z.string().min(1).max(200000),
  project_style: z.string().optional(),
  aspect_ratio: z.string().optional(),
  target_duration: z.number().optional(),
  genre: z.string().optional(),
  input_mode: z.enum(['one_liner', 'outline', 'novel']).optional(),
});

/** 解析文本模型：body 指定 > 用户默认文本模型 > 已注册文本模型（首个） */
function resolveTextModel(
  db: Database,
  userId: string,
  provider?: string,
  modelName?: string,
): { provider: string; modelName: string } {
  if (provider && modelName) return { provider, modelName };
  try {
    const pref = UserPreferenceDAO.getByUser(db, userId);
    const key = pref?.default_text_model;
    if (key && key.includes(':')) {
      const [p, m] = key.split(':');
      if (p && m) return { provider: p, modelName: m };
    }
  } catch { /* 忽略 */ }
  const models = ModelRegistryDAO.listByUserAndType(db, userId, 'text');
  if (models.length === 0) {
    throw createError(400, ErrorCodes.MODEL_NOT_CONFIGURED, '请先配置文本模型，或在请求中指定 provider/modelName');
  }
  return { provider: models[0].provider, modelName: models[0].model_name };
}

// /api/projects/from-input：接受 {input_mode, content, title, visual_style, aspect_ratio}，
// 调用 scriptRewriter 生成标准短剧剧本后创建项目 + 剧集
router.post('/from-input', validateBody(fromInputSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const { input_mode, content, title, visual_style, aspect_ratio, target_episodes, provider, modelName, style, pacing, custom_prompt } = req.body;

  const model = resolveTextModel(db, req.user.id, provider, modelName);
  const rewriteOptions: ScriptRewriteOptions = {
    db,
    userId: req.user.id,
    provider: model.provider,
    modelName: model.modelName,
    targetEpisodes: target_episodes,
    style,
    pacing,
    // 自定义改写提示词：有值时代替系统自动构建的提示词
    customPrompt: custom_prompt,
  };

  // 按输入模式改写为标准短剧剧本
  const script = await rewriteScriptByMode(input_mode, content, rewriteOptions);

  // P1-23: AI 返回空剧本时直接抛 400，不创建项目（避免空项目/空剧集污染列表）
  if (!script || !String(script).trim()) {
    throw createError(400, 'EMPTY_SCRIPT', 'AI 生成的剧本为空，请重试或调整输入');
  }

  // 拆分为剧集并创建
  const episodes = splitScriptToEpisodes(script);
  if (episodes.length === 0) {
    throw createError(400, 'EMPTY_SCRIPT', 'AI 生成的剧本为空，请重试或调整输入');
  }

  // 创建项目（锁定字段：visual_style / aspect_ratio / input_mode 创建后不可编辑）
  const project = ProjectDAO.create(db, {
    user_id: req.user.id,
    title: title || '未命名项目',
    mode: 'semi-auto',
    pipeline_step: 'script',
    visual_style: visual_style || null,
    aspect_ratio: aspect_ratio || null,
    input_mode,
  });

  const createdEpisodes = db.transaction(() => {
    return episodes.map((ep, idx) => NovelEpisodeDAO.create(db, {
      user_id: req.user.id,
      project_id: project.id,
      episode_number: idx + 1,
      title: ep.title || `第${idx + 1}集`,
      script_content: ep.content,
      text_model_used: `${model.provider}/${model.modelName}`,
    }));
  })();

  console.log(`[FromInput] mode=${input_mode} 创建项目 ${project.id}，剧集 ${createdEpisodes.length} 集`);
  // P1-14: 响应附带 script 字段（首集剧本全文），供前端直接使用
  res.json({
    success: true,
    data: {
      project,
      episodes: createdEpisodes,
      script: createdEpisodes.length > 0 ? createdEpisodes[0].script_content : '',
    },
  });
}));

// 剧本改写提示词预览：不调用AI，只基于输入+项目配置构建改写提示词
router.post('/preview-script-prompt', validateBody(previewScriptPromptSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const data = await getScriptRewritePrompt(db, req.body.input, {
    project_style: req.body.project_style,
    aspect_ratio: req.body.aspect_ratio,
    target_duration: req.body.target_duration,
    genre: req.body.genre,
    input_mode: req.body.input_mode,
  });
  res.json({ success: true, data });
}));

// 项目详情
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  res.json({ success: true, data: project });
}));

// 更新项目
router.put('/:id', validateBody(updateProjectSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  const updated = ProjectDAO.update(db, req.params.id, req.body);
  res.json({ success: true, data: updated });
}));

// 删除项目（移入回收站）
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  ProjectDAO.softDelete(db, req.params.id);
  res.json({ success: true, data: { message: '项目已移入回收站' } });
}));

// 从回收站恢复项目
router.post('/:id/restore', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  ProjectDAO.restore(db, req.params.id);
  res.json({ success: true, data: { message: '项目已恢复' } });
}));

// 彻底删除项目（清理全部子资源与磁盘文件，不可恢复）
router.delete('/:id/permanent', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  ProjectDAO.deleteCascade(db, req.params.id);

  // 清理磁盘上的项目资产目录（data/{projectId} 与 uploads/{projectId}）
  for (const dir of [projectStorage.getDataDir(req.params.id), projectStorage.getUploadsDir(req.params.id)]) {
    try {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      console.error(`[ProjectPermanentDelete] 清理目录失败: ${dir}`, err);
    }
  }

  res.json({ success: true, data: { message: '项目已彻底删除' } });
}));

// ============ 小说上传与章节 ============

// 上传小说
router.post('/:id/novel/upload', novelUpload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  if (!req.file) {
    console.error('[NovelUpload] req.file 为 undefined，可能是 multipart 解析失败');
    throw createError(400, ErrorCodes.VALIDATION_ERROR, '未收到上传文件，请检查文件格式后重试');
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

  // 删除旧章节 + 插入新章节必须在同一事务内，避免解析/插入失败后旧章节已被清空
  const created = db.transaction(() => {
    NovelChapterDAO.deleteByProject(db, req.params.id);

    const chapterData = chapters.map((ch, idx) => ({
      user_id: req.user.id,
      project_id: req.params.id,
      chapter_number: idx + 1,
      title: ch.title,
      content: ch.content,
      source_file: decodedFileName,
    }));
    return NovelChapterDAO.batchCreate(db, chapterData);
  })();

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

// 更新章节（P0-2: 显式 schema，禁止 passthrough 写入未知字段）
const updateChapterSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  order: z.number().optional(),
  summary: z.string().optional(),
});

// 更新章节
router.put('/:id/chapters/:cid', validateBody(updateChapterSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  const chapter = NovelChapterDAO.getById(db, req.params.cid);
  if (!chapter || chapter.project_id !== req.params.id) throw createError(404, ErrorCodes.NOT_FOUND, '章节不存在');
  const updated = NovelChapterDAO.update(db, req.params.cid, req.body);
  res.json({ success: true, data: updated });
}));

// 合并章节
router.post('/:id/chapters/merge', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  const { chapterIds } = req.body;
  if (!Array.isArray(chapterIds) || chapterIds.length < 2) {
    throw createError(400, ErrorCodes.VALIDATION_ERROR, '至少选择2个章节');
  }
  const chapters = NovelChapterDAO.getByIds(db, chapterIds);
  // P0-4: 所有待合并章节必须存在且属于当前项目（防跨项目/跨用户合并）
  if (chapters.length === 0 || chapters.length !== chapterIds.length) {
    throw createError(404, ErrorCodes.NOT_FOUND, '章节不存在');
  }
  const foreignChapter = chapters.find(c => c.project_id !== req.params.id);
  if (foreignChapter) throw createError(404, ErrorCodes.NOT_FOUND, '章节不存在');

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
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');
  const chapter = NovelChapterDAO.getById(db, req.params.cid);
  if (!chapter || chapter.project_id !== req.params.id) throw createError(404, ErrorCodes.NOT_FOUND, '章节不存在');

  const { splitPosition } = req.body;
  if (typeof splitPosition !== 'number' || splitPosition <= 0 || splitPosition >= chapter.content.length) {
    throw createError(400, ErrorCodes.VALIDATION_ERROR, '拆分位置无效');
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
  stream: z.boolean().optional(),
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

// 生成剧集（分集调度逻辑见 services/episodeGenerationService.ts）
router.post('/:id/episodes/generate', validateBody(generateEpisodesSchema), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');

  const { chapter_ids, provider, modelName, episodes_count, style, stream } = req.body;
  const chapters = chapter_ids && chapter_ids.length > 0
    ? NovelChapterDAO.getByIds(db, chapter_ids)
    : NovelChapterDAO.listByProject(db, req.params.id);

  if (chapters.length === 0) throw createError(400, ErrorCodes.VALIDATION_ERROR, '没有可生成的章节内容');

  const novelContent = chapters.map(c => `【${c.title}】\n${c.content}`).join('\n\n');
  const totalChars = chapters.reduce((sum, c) => sum + (c.content || '').length, 0);

  // ── 目标集数：显式指定 > 原文集标记（第X集/第X话） > 按章节数估算 ──
  const explicitCount = episodes_count && episodes_count > 0 ? episodes_count : null;
  const episodeMarkMax = detectMaxEpisodeMark(chapters);
  const estimated = explicitCount ?? episodeMarkMax ?? Math.max(1, Math.ceil(chapters.length / 2));
  // 每集至少对应一章：目标集数不超过章节数，避免无内容可改编的空集
  const targetEpisodes = Math.min(estimated, chapters.length);
  // 有明确目标（指定集数或原文有集标记）时按目标补全；自动且无标记时尊重 AI 划分，不强制
  const enforceCount = explicitCount !== null || episodeMarkMax !== null;
  // 分批条件：集数 > 10 或内容过长
  const needBatch = targetEpisodes > 10 || totalChars > 50000;
  const batchSize = calcBatchSize(totalChars, targetEpisodes);

  console.log(`[GenerateEpisodes] 目标 ${targetEpisodes} 集（用户指定=${explicitCount ?? '否'}，集标记=${episodeMarkMax ?? '无'}，章节 ${chapters.length} 章 / ${totalChars} 字符），分批=${needBatch}，每批 ${batchSize} 集`);

  // 流式进度：每批完成即向前端推送真实进度（集数），不模拟
  const send = (payload: any) => {
    if (stream) res.write(JSON.stringify(payload) + '\n');
  };

  let allEpisodesData: any[] = [];
  let totalBatches = 0;

  try {
    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.flushHeaders();
      send({ done: false, total: targetEpisodes, completed: 0, stage: '正在分析小说章节...' });
    }

    if (needBatch) {
      totalBatches = Math.ceil(targetEpisodes / batchSize);
      for (let batch = 0; batch < totalBatches; batch++) {
        const startEpisode = batch * batchSize + 1;
        const batchCount = Math.min(batchSize, targetEpisodes - batch * batchSize);
        const batchChapters = selectChaptersForRange(
          chapters, startEpisode, startEpisode + batchCount - 1, targetEpisodes, episodeMarkMax !== null
        );
        const batchContent = batchChapters.map(c => `【${c.title}】\n${c.content}`).join('\n\n');
        console.log(`[GenerateEpisodes] 第${batch + 1}/${totalBatches}批：第${startEpisode}-${startEpisode + batchCount - 1}集，使用${batchChapters.length}章`);

        if (stream) send({ done: false, total: targetEpisodes, completed: Math.min(startEpisode - 1, targetEpisodes), batch: batch + 1, totalBatches, stage: `正在生成第${startEpisode}集...（批次 ${batch + 1}/${totalBatches}）` });

        const batchData = await generateEpisodeBatch(
          db, req.user.id, provider, modelName, style, batchContent, startEpisode, batchCount, enforceCount
        );
        allEpisodesData = allEpisodesData.concat(batchData);
        if (stream) send({ done: false, total: targetEpisodes, completed: Math.min(startEpisode - 1 + batchData.length, targetEpisodes), batch: batch + 1, totalBatches, stage: `已完成第${startEpisode}-${Math.min(startEpisode + batchCount - 1, targetEpisodes)}集（${batch + 1}/${totalBatches} 批）` });
      }
    } else {
      if (stream) send({ done: false, total: targetEpisodes, completed: 0, stage: '正在生成剧集剧本...' });
      allEpisodesData = await generateEpisodeBatch(
        db, req.user.id, provider, modelName, style, novelContent, 1, targetEpisodes, enforceCount
      );
    }

    console.log(`[GenerateEpisodes] 共解析出 ${allEpisodesData.length} 集数据（目标 ${targetEpisodes} 集）`);

    // 删除旧剧集 + 插入新剧集必须在同一事务内：
    // novel_episodes 的子表（shots/keyframes/角色等）是 ON DELETE CASCADE，
    // 若先删后插中途失败（如 AI 返回重复集号触发唯一索引），旧分镜将永久丢失
    const created = db.transaction(() => {
      const oldEpisodes = NovelEpisodeDAO.listByProject(db, req.params.id);
      for (const ep of oldEpisodes) NovelEpisodeDAO.deleteCascade(db, ep.id);

      // AI 可能返回重复集号（uq_novel_episodes_proj_num 唯一约束），先顺序去重
      const seen = new Set<number>();
      let nextNum = 1;
      return allEpisodesData.map((ep: any, idx: number) => {
        let episodeNum = ep.episodeNumber || ep.episode_number || idx + 1;
        while (seen.has(episodeNum)) episodeNum = allEpisodesData.length + nextNum++;
        seen.add(episodeNum);
        const chapterRangeVal = normalizeChapterRange(ep.chapterRange || ep.chapter_range, episodeNum);
        const scriptText = structuredScriptToText(ep) || ep.scriptContent || ep.script_content || '';
        const episodeTitle = ep.episode_title || ep.title || ep.episodeTitle || `第${episodeNum}集`;
        return NovelEpisodeDAO.create(db, {
          user_id: req.user.id,
          project_id: req.params.id,
          episode_number: episodeNum,
          title: episodeTitle,
          chapter_range: chapterRangeVal,
          script_content: scriptText,
          text_model_used: `${provider}/${modelName}`,
        });
      });
    })();

    if (created.length === 0) {
      throw createError(502, ErrorCodes.AI_CALL_FAILED, 'AI 未能生成任何剧集，请重试或更换模型');
    }

    // 按 episode_number 排序
    created.sort((a, b) => a.episode_number - b.episode_number);

    if (stream) {
      send({ done: false, total: targetEpisodes, completed: created.length, stage: '整理完成' });
      send({ done: true, data: created });
      res.end();
      return;
    }
    res.json({ success: true, data: created });
  } catch (err: any) {
    if (stream) {
      try {
        send({ done: false, error: err?.message || '生成失败' });
        send({ done: true, data: null, error: err?.message || '生成失败' });
        res.end();
      } catch { /* 流已断 */ }
      return;
    }
    throw err;
  }
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
  if (!project) throw createError(404, ErrorCodes.NOT_FOUND, '项目不存在');

  const { episode_ids } = req.body;
  let deleted = 0;
  for (const epId of episode_ids) {
    const episode = NovelEpisodeDAO.getByIdAndUser(db, epId, req.user.id);
    if (episode && episode.project_id === req.params.id) {
      NovelEpisodeDAO.deleteCascade(db, epId);
      deleted++;
    }
  }
  res.json({ success: true, data: { deleted } });
}));

export default router;
