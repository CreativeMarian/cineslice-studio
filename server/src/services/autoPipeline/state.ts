// 全自动流水线模块级状态（单一实例，所有子模块共享，禁止各自 new）
import type { AutoPipelineTask } from './types';
import type { ScriptAnalysisResult } from '../scriptAnalysisService';

// 内存中的自动流水线任务状态
export const tasks = new Map<string, AutoPipelineTask>();

// 剧本分析结果缓存（episodeId -> analysis）- 按剧集缓存，支持多剧集项目
export const scriptAnalysisCache = new Map<string, ScriptAnalysisResult>();
