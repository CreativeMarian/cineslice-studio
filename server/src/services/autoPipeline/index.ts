// 全自动流水线服务门面：组装各子模块，保持与原 AutoPipelineService 完全一致的方法签名
import type { Database } from '../../types';
import type { AutoPipelineTask } from './types';
import { saveTask, getTask, getCurrentRunningTask, cancel, init } from './taskStore';
import {
  getFirstModel,
  getProjectStylePreset,
  getOrCreateScriptAnalysis,
  buildDirectorShotContext,
  inferMoodFromShot,
} from './helpers';
import { start, resume, runPipeline } from './runner';
import { stageNovel } from './stages/novel';
import { stageEpisodes } from './stages/episodes';
import { stageScript } from './stages/script';
import { stageCharacters } from './stages/characters';
import { stageScenes } from './stages/scenes';
import { stageShots } from './stages/shots';
import { stageKeyframes } from './stages/keyframes';
import { stageAudio } from './stages/audio';
import { stageVideo } from './stages/video';

export type { AutoPipelineTask };
export type { ScriptAnalysisResult } from '../scriptAnalysisService';
export { runPipeline };

export const AutoPipelineService = {
  saveTask(db: Database, task: AutoPipelineTask): void {
    saveTask(db, task);
  },

  getTask(db: Database, taskId: string): AutoPipelineTask | undefined {
    return getTask(db, taskId);
  },

  getCurrentRunningTask(db: Database, projectId: string): AutoPipelineTask | null {
    return getCurrentRunningTask(db, projectId);
  },

  cancel(db: Database, taskId: string): boolean {
    return cancel(db, taskId);
  },

  init(db: Database): void {
    init(db);
  },

  resume(db: Database, taskId: string): AutoPipelineTask | null {
    return resume(db, taskId);
  },

  start(db: Database, projectId: string, userId: string): AutoPipelineTask {
    return start(db, projectId, userId);
  },

  getFirstModel(db: Database, userId: string, modelType: string): { provider: string; modelName: string } | null {
    return getFirstModel(db, userId, modelType);
  },

  getProjectStylePreset(db: Database, projectId: string) {
    return getProjectStylePreset(db, projectId);
  },

  getOrCreateScriptAnalysis(
    db: Database,
    projectId: string,
    userId: string,
    episodeId: string
  ) {
    return getOrCreateScriptAnalysis(db, projectId, userId, episodeId);
  },

  buildDirectorShotContext(
    db: Database,
    shot: any,
    allShots: any[],
    episodeId: string,
    totalShots: number
  ) {
    return buildDirectorShotContext(db, shot, allShots, episodeId, totalShots);
  },

  inferMoodFromShot(shot: any): string {
    return inferMoodFromShot(shot);
  },

  async runPipeline(db: Database, task: AutoPipelineTask): Promise<void> {
    await runPipeline(db, task);
  },

  // ============ 各阶段执行（保留原有方法名，测试通过方括号访问） ============

  stageNovel(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageNovel(db, task);
  },

  stageEpisodes(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageEpisodes(db, task);
  },

  stageScript(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageScript(db, task);
  },

  stageCharacters(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageCharacters(db, task);
  },

  stageScenes(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageScenes(db, task);
  },

  stageShots(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageShots(db, task);
  },

  stageKeyframes(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageKeyframes(db, task);
  },

  stageAudio(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageAudio(db, task);
  },

  stageVideo(db: Database, task: AutoPipelineTask): Promise<void> {
    return stageVideo(db, task);
  },
};
