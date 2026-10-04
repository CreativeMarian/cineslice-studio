// 即梦 Jimeng 视频适配器（字节跳动/火山引擎）
// v1.2
// API 文档: https://www.volcengine.com/docs/85621/1791184
// 官方API: https://visual.volcengineapi.com (需签名认证)
// 兼容代理: https://api.jimeng.ai/v1 (Bearer Token, OpenAI风格)
// 注意：即梦使用 image_urls 数组字段，prompt建议400字以内不超过800字

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerVideoFactory } from '../registry';

export class JimengVideoAdapter implements VideoAdapter {
  readonly provider = 'jimeng';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'jimeng-v1';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://api.jimeng.ai/v1').replace(/\/$/, '');
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    // 直接使用传入提示词（极简系统：一致性靠参考图，不再做增强包装）
    const basePrompt = params.motion || params.prompt || '';

    // 即梦prompt限制800字符，超长则截断
    const prompt = basePrompt.length > 800 ? basePrompt.substring(0, 797) + '...' : basePrompt;

    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt,
      duration: params.duration || 5,
      resolution: params.resolution || '720p',
      ratio: params.ratio || '16:9',
    };

    // 图生视频：即梦使用 image_urls 数组字段
    if (params.firstFrameImageUrl) {
      body.image_urls = [params.firstFrameImageUrl];
      // 首尾帧模式
      if (params.lastFrameImageUrl) {
        body.image_urls = [params.firstFrameImageUrl, params.lastFrameImageUrl];
      }
    }
    // TODO: 此模型API不支持图参考（image_urls 仅用于首尾帧，无独立角色参考图字段），角色一致性仅靠提示词

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/videos/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      // 兼容多种响应结构：{ data: { id } } / { id } / { task_id } / { data: { task_id } }
      const taskId =
        data?.data?.id ||
        data?.id ||
        data?.data?.task_id ||
        data?.task_id ||
        '';

      if (!taskId) {
        throw new AIError('AI_CALL_FAILED', '即梦视频生成任务创建失败：未返回任务 ID');
      }

      return {
        taskId,
        status: 'pending',
        estimatedTimeSeconds: 120,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `即梦视频生成调用失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      const data = await httpRequest<any>(
        `${this.baseUrl}/videos/generations/${taskId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // 兼容多种状态字段
      const rawStatus =
        data?.data?.status ||
        data?.status ||
        data?.data?.task_status ||
        data?.task_status ||
        'processing';

      let mappedStatus: VideoGenerateResult['status'] = 'processing';
      if (
        rawStatus === 'succeeded' ||
        rawStatus === 'completed' ||
        rawStatus === 'success'
      ) {
        mappedStatus = 'completed';
      } else if (rawStatus === 'failed' || rawStatus === 'error') {
        mappedStatus = 'failed';
      } else if (rawStatus === 'pending' || rawStatus === 'queued' || rawStatus === 'submitted') {
        mappedStatus = 'pending';
      }

      // 兼容多种视频 URL 字段
      const taskResult = data?.data || data;
      const videoUrl =
        taskResult?.video_url ||
        taskResult?.url ||
        taskResult?.videos?.[0]?.url ||
        taskResult?.output?.video_url ||
        '';

      return {
        taskId,
        status: mappedStatus,
        videoUrl: videoUrl || undefined,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `即梦视频任务查询失败: ${(err as Error).message}`);
    }
  }
}

registerVideoFactory('jimeng', (modelName, apiKey, endpointUrl) => {
  return new JimengVideoAdapter(modelName, apiKey, endpointUrl);
});
