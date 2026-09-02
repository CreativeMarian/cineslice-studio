// 全自动流水线模块级状态（单一实例，所有子模块共享，禁止各自 new）
import type { AutoPipelineTask } from './types';
import type { ScriptAnalysisResult } from '../scriptAnalysisService';

// 内存中的自动流水线任务状态
export const tasks = new Map<string, AutoPipelineTask>();

// 剧本分析结果缓存（episodeId -> analysis）- 按剧集缓存，支持多剧集项目
// 每个条目是大体积 AI 分析对象，长期运行的服务需要上限淘汰（FIFO，保留最新 20 个剧集）
export const SCRIPT_ANALYSIS_CACHE_MAX = 20;
export const scriptAnalysisCache = new Map<string, ScriptAnalysisResult>();

export function cacheScriptAnalysis(episodeId: string, result: ScriptAnalysisResult): void {
  if (scriptAnalysisCache.has(episodeId)) {
    scriptAnalysisCache.delete(episodeId); // 刷新插入顺序
  }
  scriptAnalysisCache.set(episodeId, result);
  while (scriptAnalysisCache.size > SCRIPT_ANALYSIS_CACHE_MAX) {
    const oldest = scriptAnalysisCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    scriptAnalysisCache.delete(oldest);
  }
}
