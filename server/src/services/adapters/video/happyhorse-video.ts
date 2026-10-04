// HappyHorse 视频适配器（阿里巴巴通义千问 / DashScope）
// v1.0
// API 文档: https://www.qianwenai.com/models/happyhorse-1.1-i2v
// 注意：使用DashScope异步API，请求头需 X-DashScope-Async: enable

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerVideoFactory } from '../registry';

export class HappyHorseVideoAdapter implements VideoAdapter {
  readonly provider = 'happyhorse';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'happyhorse-1.1-i2v';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://dashscope.aliyuncs.com/api/v1').replace(/\/$/, '');
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    // 直接使用传入提示词（极简系统：一致性靠参考图，不再做增强包装）
    const basePrompt = params.motion || params.prompt || '';

    // HappyHorse prompt限制约2000字符，超长则截断
    const prompt = basePrompt.length > 2000 ? basePrompt.substring(0, 1997) + '...' : basePrompt;

    // resolution格式：480P / 720P / 1080P
    let resolution = params.resolution || '720P';
    if (resolution === '480p') resolution = '480P';
    if (resolution === '720p') resolution = '720P';
    if (resolution === '1080p') resolution = '1080P';

    // 构建media数组（图生视频使用first_frame）
    const media: Array<Record<string, string>> = [];
    if (params.firstFrameImageUrl) {
      media.push({
        type: 'first_frame',
        url: params.firstFrameImageUrl,
      });
      // 尾帧图片（如果支持）
      if (params.lastFrameImageUrl) {
        media.push({
          type: 'last_frame',
          url: params.lastFrameImageUrl,
        });
      }
    }
    // TODO: 此模型API不支持图参考（media 仅支持 first_frame/last_frame，无角色参考图类型），角色一致性仅靠提示词

    const body: Record<string, unknown> = {
      model: this.modelName,
      input: {
        prompt,
        media,
      },
      parameters: {
        resolution,
        duration: params.duration || 5,
      },
    };

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/services/aigc/video-generation/video-synthesis`, {
        method: 'POST',
        headers: {
          'X-DashScope-Async': 'enable',
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      // DashScope响应结构：{ output: { task_id, task_status }, request_id, code, message }
      const taskId =
        data?.output?.task_id ||
        data?.task_id ||
        data?.data?.task_id ||
        data?.id ||
        '';

      if (!taskId) {
        const errorMsg = data?.message || data?.output?.message || '未知错误';
        throw new AIError('AI_CALL_FAILED', `HappyHorse视频生成任务创建失败：${errorMsg}`);
      }

      return {
        taskId,
        status: 'pending',
        estimatedTimeSeconds: 120,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `HappyHorse视频生成调用失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      const data = await httpRequest<any>(
        `${this.baseUrl}/services/aigc/video-generation/video-synthesis/${taskId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // DashScope查询响应：{ output: { task_status, video_url }, request_id, code, message }
      const rawStatus =
        data?.output?.task_status ||
        data?.task_status ||
        data?.status ||
        'PENDING';

      let mappedStatus: VideoGenerateResult['status'] = 'processing';
      const statusUpper = String(rawStatus).toUpperCase();
      if (
        statusUpper === 'SUCCEEDED' ||
        statusUpper === 'SUCCESS' ||
        statusUpper === 'COMPLETED' ||
        statusUpper === 'DONE'
      ) {
        mappedStatus = 'completed';
      } else if (
        statusUpper === 'FAILED' ||
        statusUpper === 'ERROR' ||
        statusUpper === 'CANCELED' ||
        statusUpper === 'CANCELLED'
      ) {
        mappedStatus = 'failed';
      } else if (
        statusUpper === 'PENDING' ||
        statusUpper === 'QUEUED' ||
        statusUpper === 'SUBMITTED'
      ) {
        mappedStatus = 'pending';
      }

      // 视频URL：output.video_url 或 output.results[0].url
      const videoUrl =
        data?.output?.video_url ||
        data?.output?.results?.[0]?.url ||
        data?.video_url ||
        data?.data?.video_url ||
        '';

      return {
        taskId,
        status: mappedStatus,
        videoUrl: videoUrl || undefined,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `HappyHorse视频任务查询失败: ${(err as Error).message}`);
    }
  }
}

registerVideoFactory('happyhorse', (modelName, apiKey, endpointUrl) => {
  return new HappyHorseVideoAdapter(modelName, apiKey, endpointUrl);
});
