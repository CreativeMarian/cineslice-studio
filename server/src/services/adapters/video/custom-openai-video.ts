// 自定义 OpenAI 兼容视频适配器
// v1.0
// 支持标准的异步任务模式：创建任务 + 轮询查询
// 适用于大多数 OpenAI 兼容的视频生成 API

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerVideoFactory } from '../registry';

export class CustomOpenAIVideoAdapter implements VideoAdapter {
  readonly provider = 'custom-openai';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    if (!this.apiKey) {
      throw new AIError('AI_CALL_FAILED', '自定义视频模型缺少 API Key 配置', false);
    }

    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt: params.prompt || '',
    };

    // 可选参数
    if (params.duration) body.duration = params.duration;
    if (params.ratio) body.ratio = params.ratio;
    if (params.resolution) body.resolution = params.resolution;
    if (params.motion) body.motion = params.motion;

    // 图生视频：首帧图片
    if (params.firstFrameImageUrl) {
      body.image = params.firstFrameImageUrl;
      body.mode = 'image-to-video';
    }

    // 尾帧图片（首尾帧模式）
    if (params.lastFrameImageUrl) {
      body.last_frame = params.lastFrameImageUrl;
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/videos/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body,
      });

      // 标准响应格式：{ id: 'task_xxx', status: 'processing' }
      const taskId = data.id || data.task_id || data.taskId || '';
      const status = data.status || 'processing';

      if (!taskId) {
        // 如果没有返回 taskId，可能是同步生成，直接返回视频 URL
        const videoUrl = data.video_url || data.url || data.output?.url || '';
        if (videoUrl) {
          return {
            taskId: `sync_${Date.now()}`,
            status: 'completed',
            videoUrl,
          };
        }
        throw new AIError('AI_CALL_FAILED', '视频生成未返回任务ID或视频URL');
      }

      return {
        taskId,
        status: this.mapStatus(status),
        estimatedTimeSeconds: 60,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `自定义视频模型调用失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      const data = await httpRequest<any>(`${this.baseUrl}/videos/generations/${taskId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      const status = data.status || 'processing';
      const videoUrl = data.video_url || data.url || data.output?.url || '';
      const error = data.error || data.error_message || '';

      return {
        taskId,
        status: this.mapStatus(status),
        videoUrl: videoUrl || undefined,
        error: error || undefined,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `查询视频任务失败: ${(err as Error).message}`);
    }
  }

  private mapStatus(status: string): VideoGenerateResult['status'] {
    const s = status.toLowerCase();
    if (s === 'completed' || s === 'success' || s === 'succeeded') return 'completed';
    if (s === 'failed' || s === 'error') return 'failed';
    if (s === 'pending' || s === 'queued') return 'pending';
    return 'processing';
  }
}

registerVideoFactory('custom-openai', (modelName, apiKey, endpointUrl) => {
  return new CustomOpenAIVideoAdapter(modelName, apiKey, endpointUrl);
});
