// AI 调用代理：路由→重试→缓存→成本统计→日志
// v1.1 - 音频适配器支持 config 参数

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Database, TextGenerateResult, ImageGenerateResult } from '../types';
import { ModelRegistryDAO, AiCacheDAO, RenderLogDAO } from '../models';
import { getTextAdapter, getImageAdapter, getVideoAdapter, getAudioAdapter } from './adapters';
import { AIError } from './adapters/base';
import type { VideoGenerateResult } from './adapters/base';
import { costTracker } from './costTracker';
import { resolveModelName } from './modelUtils';
import { projectStorage } from './projectStorage';
import { createError } from '../middleware/errorHandler';
import { parseAIError, formatAIErrorForLog } from '../utils/aiErrorHandler';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number }
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= options.maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AIError && err.retryable;
      if (!retryable || i === options.maxRetries) throw err;
      const delay = options.baseDelay * Math.pow(2, i);
      console.log(`[AI Proxy] 重试 ${i + 1}/${options.maxRetries}，等待${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// 下载图片到本地
async function downloadImage(url: string, saveDir: string): Promise<string> {
  projectStorage.ensureDir(saveDir);
  const fileName = projectStorage.generateFileName('png');
  const localPath = path.resolve(saveDir, fileName);

  // 处理 base64 data URL
  if (url.startsWith('data:image')) {
    const base64Data = url.split(',')[1];
    fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));
    return localPath;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片下载失败: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
  return localPath;
}

export const aiProxy = {
  async generateText(params: {
    db: Database;
    userId: string;
    provider: string;
    modelName: string;
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    responseFormat?: 'text' | 'json';
  }): Promise<TextGenerateResult> {
    const { db, userId } = params;

    // 1. 查API Key
    const modelConfig = ModelRegistryDAO.getByUserAndModel(db, userId, params.provider, params.modelName);
    if (!modelConfig?.api_key) {
      throw createError(400, 'MODEL_NOT_CONFIGURED', `请先配置模型 ${params.provider}/${params.modelName} 的 API Key`);
    }

    // 2. 检查缓存（仅JSON输出可缓存）
    if (params.responseFormat === 'json') {
      try {
        const cacheKey = sha256(`text:${userId}:${params.provider}:${params.modelName}:${params.prompt}:${params.temperature ?? 0.7}:${params.systemPrompt || ''}`);
        const cached = AiCacheDAO.get(db, cacheKey);
        if (cached) {
          console.log('[AI Proxy] 文本缓存命中');
          return JSON.parse(cached) as TextGenerateResult;
        }
      } catch (cacheErr) {
        console.error('[AI Proxy] 缓存读取失败（跳过）:', (cacheErr as Error).message);
      }
    }

    // 3. 获取适配器（支持模型名覆盖，如火山方舟接入点ID）
    const actualModelName = resolveModelName(modelConfig, params.modelName);
    const adapter = getTextAdapter(params.provider, actualModelName, modelConfig.api_key, modelConfig.endpoint_url || undefined);

    // 4. 重试调用
    let result: TextGenerateResult;
    try {
      result = await withRetry(() => adapter.generate({
        prompt: params.prompt,
        systemPrompt: params.systemPrompt,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        topP: params.topP,
        responseFormat: params.responseFormat,
      }), { maxRetries: 3, baseDelay: 1000 });
    } catch (err) {
      const parsed = parseAIError(err);
      console.error(`[AI Proxy] 文本生成失败 ${formatAIErrorForLog(err, params.provider, params.modelName)}`);
      throw new AIError(parsed.code as 'AI_CALL_FAILED' | 'AI_RATE_LIMITED', `${parsed.message}${parsed.suggestion ? `。${parsed.suggestion}` : ''}`);
    }

    // 5. 记录成本
    await costTracker.record(db, userId, params.provider, params.modelName, 'text', result.usage.totalTokens);

    // 6. 记录渲染日志
    RenderLogDAO.create(db, {
      user_id: userId,
      action: 'text_generate',
      details: JSON.stringify({ model: params.modelName, tokens: result.usage.totalTokens, provider: params.provider }),
    });

    // 7. 写入缓存
    if (params.responseFormat === 'json') {
      try {
        const cacheKey = sha256(`text:${userId}:${params.provider}:${params.modelName}:${params.prompt}:${params.temperature ?? 0.7}:${params.systemPrompt || ''}`);
        AiCacheDAO.set(db, cacheKey, JSON.stringify(result), 'text', 3600);
      } catch (cacheErr) {
        console.error('[AI Proxy] 缓存写入失败（跳过）:', (cacheErr as Error).message);
      }
    }

    return result;
  },

  async generateImage(params: {
    db: Database;
    userId: string;
    projectId: string;
    provider: string;
    modelName: string;
    prompt: string;
    negativePrompt?: string;
    size?: '512x512' | '1024x1024' | '1024x1792' | '1792x1024' | '2048x2048' | '2048x1152' | '2560x1440' | '1440x2560';
    count?: number;
    referenceImages?: string[];
    style?: string;
    saveSubDir?: string;
  }): Promise<ImageGenerateResult> {
    const { db, userId, projectId } = params;

    // 1. 查API Key
    const modelConfig = ModelRegistryDAO.getByUserAndModel(db, userId, params.provider, params.modelName);
    if (!modelConfig?.api_key) {
      throw createError(400, 'MODEL_NOT_CONFIGURED', `请先配置模型 ${params.provider}/${params.modelName} 的 API Key`);
    }

    // 2. 检查图片缓存
    let cached = null;
    try {
      const refHash = params.referenceImages ? sha256(params.referenceImages.join(',')) : '';
      const cacheKey = sha256(`img:${userId}:${params.provider}:${params.modelName}:${params.prompt}:${params.negativePrompt || ''}:${params.size || ''}:${refHash}`);
      cached = AiCacheDAO.get(db, cacheKey);
    } catch (cacheErr) {
      console.error('[AI Proxy] 图片缓存读取失败（跳过）:', (cacheErr as Error).message);
    }
    if (cached) {
      console.log('[AI Proxy] 图片缓存命中');
      return JSON.parse(cached) as ImageGenerateResult;
    }

    // 3. 获取适配器（支持模型名覆盖）
    const actualModelName = resolveModelName(modelConfig, params.modelName);
    const adapter = getImageAdapter(params.provider, actualModelName, modelConfig.api_key, modelConfig.endpoint_url || undefined);

    // 4. 重试调用
    const result = await withRetry(() => adapter.generate({
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      size: params.size,
      count: params.count || 1,
      referenceImages: params.referenceImages,
      style: params.style,
    }), { maxRetries: 3, baseDelay: 2000 });

    // 5. 下载图片到本地
    const saveDir = params.saveSubDir
      ? path.resolve(projectStorage.getDataDir(projectId), params.saveSubDir)
      : projectStorage.getKeyframesDir(projectId);

    const localImages = [];
    for (const img of result.images) {
      try {
        const localPath = await downloadImage(img.url, saveDir);
        const urlPath = projectStorage.toUrlPath(localPath);
        localImages.push({ url: urlPath, prompt: img.prompt || params.prompt });
      } catch (err) {
        console.error('[AI Proxy] 图片下载失败:', err);
        localImages.push(img);
      }
    }

    const finalResult: ImageGenerateResult = {
      images: localImages,
      model: result.model,
    };

    // 6. 记录成本
    await costTracker.record(db, userId, params.provider, params.modelName, 'image', 0, localImages.length);

    // 7. 记录渲染日志
    RenderLogDAO.create(db, {
      user_id: userId,
      action: 'image_generate',
      details: JSON.stringify({ model: params.modelName, count: localImages.length, provider: params.provider, projectId }),
    });

    // 8. 写入缓存
    try {
      const refHash2 = params.referenceImages ? sha256(params.referenceImages.join(',')) : '';
      const cacheKey2 = sha256(`img:${userId}:${params.provider}:${params.modelName}:${params.prompt}:${params.negativePrompt || ''}:${params.size || ''}:${refHash2}`);
      AiCacheDAO.set(db, cacheKey2, JSON.stringify(finalResult), 'image', 86400);
    } catch (cacheErr) {
      console.error('[AI Proxy] 缓存写入失败（跳过）:', (cacheErr as Error).message);
    }

    return finalResult;
  },

  // 测试模型连接
  async testConnection(params: {
    db: Database;
    userId: string;
    provider: string;
    modelName: string;
    modelType: string;
  }): Promise<{ status: 'success' | 'failed'; latencyMs: number; error?: string }> {
    const { db, userId } = params;
    const modelConfig = ModelRegistryDAO.getByUserAndModel(db, userId, params.provider, params.modelName);
    if (!modelConfig?.api_key) {
      return { status: 'failed', latencyMs: 0, error: 'API Key 未配置' };
    }

    const startTime = Date.now();
    try {
      if (params.modelType === 'text') {
        const actualModelName = resolveModelName(modelConfig, params.modelName);
        const adapter = getTextAdapter(params.provider, actualModelName, modelConfig.api_key, modelConfig.endpoint_url || undefined);
        await adapter.generate({ prompt: 'Hi', maxTokens: 5, temperature: 0 });
      } else if (params.modelType === 'image') {
        const actualModelName = resolveModelName(modelConfig, params.modelName);
        const adapter = getImageAdapter(params.provider, actualModelName, modelConfig.api_key, modelConfig.endpoint_url || undefined);
        // 使用 2048x2048 测试，豆包 Seedream 等模型要求至少 3686400 像素(1920x1920)
        await adapter.generate({ prompt: 'test', count: 1, size: '2048x2048' });
      } else if (params.modelType === 'video') {
        const actualModelName = resolveModelName(modelConfig, params.modelName);
        const adapter = getVideoAdapter(params.provider, actualModelName, modelConfig.api_key, modelConfig.endpoint_url || undefined);
        // 视频测试：只创建任务，不等待完成（视频生成耗时很长）
        const result = await adapter.generate({
          prompt: 'test',
          duration: 4,
          ratio: '16:9',
          resolution: '720p',
        });
        if (!result.taskId) {
          throw new Error('视频任务创建失败：未返回任务ID');
        }
      } else if (params.modelType === 'audio') {
        const actualModelName = resolveModelName(modelConfig, params.modelName);
        const adapter = getAudioAdapter(
          params.provider,
          actualModelName,
          modelConfig.api_key,
          modelConfig.endpoint_url || undefined,
          modelConfig.config || undefined
        );
        await adapter.generate({ text: 'Hi', speed: 1.0 });
      } else {
        throw new Error(`不支持的模型类型: ${params.modelType}`);
      }
      const latencyMs = Date.now() - startTime;
      return { status: 'success', latencyMs };
    } catch (err) {
      return { status: 'failed', latencyMs: Date.now() - startTime, error: (err as Error).message };
    }
  },

  // 生成视频（异步任务，返回taskId）
  async generateVideo(params: {
    db: Database;
    userId: string;
    projectId: string;
    provider: string;
    modelName: string;
    prompt?: string;
    firstFrameImageUrl?: string;
    lastFrameImageUrl?: string;
    duration?: number;
    ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
    resolution?: '720p' | '1080p' | '2k' | '4k';
    motion?: string;
    subtitles?: boolean;
  }): Promise<VideoGenerateResult> {
    const { db, userId, projectId } = params;

    // 1. 查API Key
    const modelConfig = ModelRegistryDAO.getByUserAndModel(db, userId, params.provider, params.modelName);
    if (!modelConfig?.api_key) {
      throw createError(400, 'MODEL_NOT_CONFIGURED', `请先配置模型 ${params.provider}/${params.modelName} 的 API Key`);
    }

    // 2. 获取适配器
    const actualModelName = resolveModelName(modelConfig, params.modelName);
    const adapter = getVideoAdapter(params.provider, actualModelName, modelConfig.api_key, modelConfig.endpoint_url || undefined);

    // 3. 调用生成（异步任务）
    const result = await withRetry(() => adapter.generate({
      prompt: params.prompt,
      firstFrameImageUrl: params.firstFrameImageUrl,
      lastFrameImageUrl: params.lastFrameImageUrl,
      duration: params.duration,
      ratio: params.ratio,
      resolution: params.resolution,
      motion: params.motion,
      subtitles: params.subtitles,
    }), { maxRetries: 2, baseDelay: 2000 });

    // 4. 记录日志
    RenderLogDAO.create(db, {
      user_id: userId,
      action: 'video_generate',
      details: JSON.stringify({ model: params.modelName, provider: params.provider, projectId, taskId: result.taskId }),
    });

    // 5. 记录成本（预估，基于视频时长）
    costTracker.record(db, userId, params.provider, params.modelName, 'video', 0, 0, params.duration || 5, 0);

    return result;
  },

  // 查询视频任务状态
  async getVideoTask(params: {
    db: Database;
    userId: string;
    provider: string;
    modelName: string;
    taskId: string;
  }): Promise<VideoGenerateResult> {
    const { db, userId } = params;

    const modelConfig = ModelRegistryDAO.getByUserAndModel(db, userId, params.provider, params.modelName);
    if (!modelConfig?.api_key) {
      throw createError(400, 'MODEL_NOT_CONFIGURED', '模型 API Key 未配置');
    }

    const actualModelName = resolveModelName(modelConfig, params.modelName);
    const adapter = getVideoAdapter(params.provider, actualModelName, modelConfig.api_key, modelConfig.endpoint_url || undefined);

    if (!adapter.getTask) {
      throw createError(400, 'NOT_SUPPORTED', '该视频模型不支持任务查询');
    }

    return adapter.getTask(params.taskId);
  },

  async generateAudio(params: {
    db: Database;
    userId: string;
    provider: string;
    modelName: string;
    text: string;
    voice?: string;
    speed?: number;
  }) {
    const { db, userId } = params;

    const modelConfig = ModelRegistryDAO.getByUserAndModel(db, userId, params.provider, params.modelName);
    if (!modelConfig?.api_key) {
      throw createError(400, 'MODEL_NOT_CONFIGURED', '音频模型 API Key 未配置');
    }

    const actualModelName = resolveModelName(modelConfig, params.modelName);
    // 传递 config 以支持 appid 等额外配置（如火山引擎 TTS）
    const adapter = getAudioAdapter(
      params.provider,
      actualModelName,
      modelConfig.api_key,
      modelConfig.endpoint_url || undefined,
      modelConfig.config || undefined
    );

    const result = await withRetry(() => adapter.generate({
      text: params.text,
      voice: params.voice,
      speed: params.speed,
    }), { maxRetries: 2, baseDelay: 1000 });

    // 记录成本（基于文本字符数）
    await costTracker.record(db, userId, params.provider, params.modelName, 'audio', 0, 0, 0, params.text.length);

    // 记录渲染日志
    RenderLogDAO.create(db, {
      user_id: userId,
      action: 'audio_generate',
      details: JSON.stringify({ model: params.modelName, voice: params.voice }),
    });

    return result;
  },
};
