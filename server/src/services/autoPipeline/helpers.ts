// 自动流水线共享工具：模型选择、风格描述、剧本分析、重试
import type { Database } from '../../types';
import {
  ModelRegistryDAO,
  ProjectDAO,
} from '../../models';
import { scriptAnalysisService, type ScriptAnalysisResult } from '../scriptAnalysisService';
import { scriptAnalysisCache, cacheScriptAnalysis, scriptAnalysisInFlight } from './state';

/**
 * 真实数据完成度检测：该阶段是否已有实际产出（幂等跳过用）
 * 与 GET /pipeline/progress 同口径——用户手动完成的操作也能正确识别
 */
export function isStageComplete(db: Database, projectId: string, stage: string): boolean {
  const count = (sql: string, ...args: any[]) => {
    const row: any = db.prepare(sql).get(...args);
    return Number(row?.c || 0);
  };
  switch (stage) {
    case 'novel':
      return count('SELECT COUNT(*) c FROM novel_chapters WHERE project_id = ?', projectId) > 0;
    case 'episodes':
      return count('SELECT COUNT(*) c FROM novel_episodes WHERE project_id = ?', projectId) > 0;
    case 'script':
      return count('SELECT COUNT(*) c FROM novel_episodes WHERE project_id = ? AND LENGTH(TRIM(script_content)) > 0', projectId) > 0;
    case 'characters': {
      const ids = db.prepare('SELECT id FROM novel_episodes WHERE project_id = ?').all(projectId) as Array<{ id: string }>;
      if (ids.length === 0) return false;
      const ph = ids.map(() => '?').join(',');
      return count(`SELECT COUNT(*) c FROM script_characters WHERE episode_id IN (${ph})`, ...ids.map(r => r.id)) > 0;
    }
    case 'scenes': {
      const ids = db.prepare('SELECT id FROM novel_episodes WHERE project_id = ?').all(projectId) as Array<{ id: string }>;
      if (ids.length === 0) return false;
      const ph = ids.map(() => '?').join(',');
      return count(`SELECT COUNT(*) c FROM script_scenes WHERE episode_id IN (${ph})`, ...ids.map(r => r.id)) > 0;
    }
    case 'shots': {
      const ids = db.prepare('SELECT id FROM novel_episodes WHERE project_id = ?').all(projectId) as Array<{ id: string }>;
      if (ids.length === 0) return false;
      const ph = ids.map(() => '?').join(',');
      return count(`SELECT COUNT(*) c FROM shots WHERE episode_id IN (${ph})`, ...ids.map(r => r.id)) > 0;
    }
    case 'keyframes': {
      // flf2v 首尾帧链路需要每镜 first+last 双帧：只生成 first 的镜头视为未完成（自动补齐 last）
      // 防止"有一帧就跳阶段"导致 last 帧永不生成、视频尾帧退化
      const totalShots = count('SELECT COUNT(*) c FROM shots s JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ?', projectId);
      if (totalShots === 0) return false;
      const shotsWithFirst = count("SELECT COUNT(DISTINCT k.shot_id) c FROM shot_keyframes k JOIN shots s ON k.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND k.frame_type = 'first' AND k.image_url IS NOT NULL AND k.image_url != ?", projectId, '');
      const shotsWithLast = count("SELECT COUNT(DISTINCT k.shot_id) c FROM shot_keyframes k JOIN shots s ON k.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND k.frame_type = 'last' AND k.image_url IS NOT NULL AND k.image_url != ?", projectId, '');
      return shotsWithFirst >= totalShots && shotsWithLast >= totalShots;
    }
    case 'audio': {
      // v3.0: 结构化配音记录（shot_audio）判定，与 progress 完成度一致
      const total = count(
        "SELECT COUNT(*) c FROM shots s JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND LENGTH(TRIM(COALESCE(s.dialogue,''))) > 0",
        projectId
      );
      if (total === 0) return false;
      const done = count(
        "SELECT COUNT(DISTINCT a.shot_id) c FROM shot_audio a JOIN shots s ON a.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND a.status = 'completed'",
        projectId
      );
      return done >= total;
    }
    case 'export': {
      // v3.0: 每集都有成功的拼接记录（render_logs episode_compose）才算完成
      const epCount = count('SELECT COUNT(*) c FROM novel_episodes WHERE project_id = ?', projectId);
      if (epCount === 0) return false;
      const done = count(
        "SELECT COUNT(*) c FROM render_logs r JOIN novel_episodes e ON r.episode_id = e.id WHERE e.project_id = ? AND r.action = 'episode_compose' AND r.details LIKE '%\"status\":\"completed\"%'",
        projectId
      );
      return done >= epCount;
    }
    case 'video': {
      // 全部镜头都有完成视频才算完成（缺失镜头由 stageVideo 逐镜补齐，不重跑已有）
      const totalShots = count('SELECT COUNT(*) c FROM shots s JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ?', projectId);
      if (totalShots === 0) return false;
      const shotsWithVideo = count("SELECT COUNT(DISTINCT v.shot_id) c FROM shot_video_intervals v JOIN shots s ON v.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND v.status = 'completed' AND v.video_url IS NOT NULL AND v.video_url != ''", projectId);
      return shotsWithVideo >= totalShots;
    }
    default:
      return false;
  }
}

/**
 * 获取第一个已配置的指定类型模型
 * 视频类型：尊重用户默认模型（is_default=1 优先，DAO 已按 is_default DESC 排序）；
 *           仅当没有任何默认视频模型时，才回退本地 ComfyUI flf2v（MiniMax H3 首尾帧——免费无额度、质量最稳）
 */
export function getFirstModel(db: Database, userId: string, modelType: string): { provider: string; modelName: string } | null {
  const models = ModelRegistryDAO.listByUserAndType(db, userId, modelType);
  if (models.length === 0) return null;
  if (modelType === 'video') {
    const first = models[0];
    if (first && first.is_default !== 1) {
      const flf = models.find(m => m.provider === 'comfyui' && String(m.model_name).toLowerCase().includes('flf2v'));
      if (flf) return { provider: flf.provider, modelName: flf.model_name };
    }
  }
  return { provider: models[0].provider, modelName: models[0].model_name };
}

/**
 * 获取项目风格描述（极简系统：用户一句话存在 project.style_description）
 * 无风格描述时返回 null（提示词函数内部兜底默认风格）
 */
export function getProjectStyleDescription(db: Database, projectId: string): string | null {
  try {
    const project = ProjectDAO.getById(db, projectId);
    if (project?.style_description && project.style_description.trim()) {
      return project.style_description.trim();
    }
  } catch (err) {
    console.error('[AutoPipeline] 获取项目风格描述失败:', (err as Error).message);
  }
  return null;
}

/**
 * 获取或创建剧本分析结果
 * 在分镜/关键帧/视频生成之前调用，分析剧情、场景、角色、情绪、节奏
 */
export async function getOrCreateScriptAnalysis(
  db: Database,
  projectId: string,
  userId: string,
  episodeId: string
): Promise<ScriptAnalysisResult | null> {
  // 检查缓存（按剧集缓存，支持多剧集项目）
  const cached = scriptAnalysisCache.get(episodeId);
  if (cached) {
    console.log('[AutoPipeline] 使用缓存的剧本分析结果');
    return cached;
  }

  // v2.0: in-flight 锁 — 并行阶段（characters/scenes）同时调用时，
  // 只有第一个触发 AI 分析，其余等待同一个 Promise，避免重复烧额度
  const inFlight = scriptAnalysisInFlight.get(episodeId);
  if (inFlight) {
    console.log('[AutoPipeline] 剧本分析进行中，等待共享结果...');
    return inFlight;
  }

  const analysisPromise = (async () => {
    try {
      console.log('[AutoPipeline] 开始剧本分析...');
      const analysis = await scriptAnalysisService.analyzeScript(db, episodeId, userId);
      if (analysis) {
        cacheScriptAnalysis(episodeId, analysis);
        console.log(`[AutoPipeline] 剧本分析完成: ${scriptAnalysisService.getAnalysisSummary(analysis)}`);
      }
      return analysis;
    } catch (err) {
      console.error('[AutoPipeline] 剧本分析失败（跳过，使用原始提示词）:', (err as Error).message);
      return null;
    } finally {
      scriptAnalysisInFlight.delete(episodeId);
    }
  })();

  scriptAnalysisInFlight.set(episodeId, analysisPromise);
  return analysisPromise;
}

/**
 * 统一 AI 调用重试包装器（v2.0 全维度优化）
 * - 指数退避：第2次2s，第3次4s，第4次8s
 * - 限流(429)自动延长退避
 * - 可恢复错误重试，不可恢复错误（如400参数错误）立即抛出
 * - 记录每次重试日志，便于排查
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxAttempts?: number;
    label?: string;
    onRetry?: (attempt: number, err: Error) => void;
  } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const label = opts.label ?? 'AI调用';
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message || '';

      // 不可恢复错误：立即抛出，不浪费重试额度
      const isUnrecoverable = /400|bad request|invalid|参数错误|格式错误|解析失败/i.test(msg)
        && !/timeout|rate|限流|429|5\d\d|network|连接|超时/i.test(msg);
      if (isUnrecoverable && attempt === 1) {
        console.warn(`[AutoPipeline][重试] ${label} 不可恢复错误，不重试: ${msg}`);
        throw lastError;
      }

      if (attempt >= maxAttempts) {
        console.error(`[AutoPipeline][重试] ${label} 已达最大重试次数(${maxAttempts})，最终失败: ${msg}`);
        throw lastError;
      }

      // 限流退避更长
      const isRateLimit = /rate[_\- ]?limit|限流|429|Too Many Requests/i.test(msg);
      const baseDelay = isRateLimit ? 10000 : 2000;
      const delay = baseDelay * Math.pow(2, attempt - 1); // 2s/4s/8s 或 10s/20s/40s

      console.warn(`[AutoPipeline][重试] ${label} 第${attempt}/${maxAttempts}次失败，${delay}ms后重试: ${msg}`);
      opts.onRetry?.(attempt, lastError);
      await new Promise<void>(r => setTimeout(r, delay));
    }
  }
  throw lastError!;
}

/**
 * 计算全自动流水线总体进度百分比
 * 基于已完成阶段数 / 总阶段数，加上当前阶段的子进度
 */
export function calculatePipelineProgress(task: { stageProgress: Record<string, string>; currentStage: string }): number {
  const stageOrder = ['novel', 'episodes', 'script', 'characters', 'scenes', 'shots', 'keyframes', 'video', 'audio', 'export'];
  let completed = 0;
  for (const stage of stageOrder) {
    const p = task.stageProgress[stage];
    if (p && (p.includes('done') || p.includes('生成') || p.includes('提取') || p.includes('跳过') || p.includes('已存在'))) {
      completed++;
    }
  }
  // 当前阶段给50%的部分进度（正在运行中）
  const currentIdx = stageOrder.indexOf(task.currentStage);
  if (currentIdx >= 0 && !task.stageProgress[task.currentStage]?.includes('done')) {
    return Math.round((completed + 0.5) / stageOrder.length * 100);
  }
  return Math.round(completed / stageOrder.length * 100);
}
