// 可灵 Kling 视频适配器（快手）
// v1.1
// API 文档: https://app.klingai.com/cn/dev/document-api/apiReference/model/imageToVideo
// 注意：可灵有自己的prompt格式和2500字符限制，不使用通用的enhanceVideoPrompt

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerVideoFactory } from '../registry';

export class KlingVideoAdapter implements VideoAdapter {
  readonly provider = 'kling';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'kling-v1';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://api-beijing.klingai.com/v1').replace(/\/$/, '');
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    // 可灵有自己的prompt格式，直接使用原始prompt，不使用通用增强
    const prompt = (params.motion || params.prompt || '').trim();
    const negativePrompt = '';

    // 可灵prompt限制2500字符，超长则截断
    const truncatedPrompt = prompt.length > 2500 ? prompt.substring(0, 2497) + '...' : prompt;

    // 判断是图生视频还是文生视频
    const isImageToVideo = !!params.firstFrameImageUrl;
    const endpoint = isImageToVideo ? '/videos/image2video' : '/videos/text2video';

    const body: Record<string, unknown> = {
      model_name: this.modelName,
      prompt: truncatedPrompt,
      negative_prompt: negativePrompt,
      duration: String(params.duration || 5),
      mode: 'std', // std(720P) / pro(1080P) / 4k
    };

    // 图生视频：首帧图片（官方字段名为 image）
    if (params.firstFrameImageUrl) {
      body.image = params.firstFrameImageUrl;
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      // 兼容多种响应结构：{ data: { task_id } } / { task_id } / { id }
      const taskId =
        data?.data?.task_id ||
        data?.task_id ||
        data?.data?.id ||
        data?.id ||
        '';

      if (!taskId) {
        throw new AIError('AI_CALL_FAILED', '可灵视频生成任务创建失败：未返回任务 ID');
      }

      return {
        taskId,
        status: 'pending',
        estimatedTimeSeconds: 120,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `可灵视频生成调用失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      const data = await httpRequest<any>(
        `${this.baseUrl}/videos/text2video/${taskId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // 兼容多种状态字段：data.task_status / data.status / status
      const rawStatus =
        data?.data?.task_status ||
        data?.data?.status ||
        data?.task_status ||
        data?.status ||
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
      const taskResult = data?.data?.task_result || data?.data || data;
      const videoUrl =
        taskResult?.videos?.[0]?.url ||
        taskResult?.video_url ||
        taskResult?.url ||
        data?.video_url ||
        '';

      return {
        taskId,
        status: mappedStatus,
        videoUrl: videoUrl || undefined,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `可灵视频任务查询失败: ${(err as Error).message}`);
    }
  }
}

registerVideoFactory('kling', (modelName, apiKey, endpointUrl) => {
  return new KlingVideoAdapter(modelName, apiKey, endpointUrl);
});
