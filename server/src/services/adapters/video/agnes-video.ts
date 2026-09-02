// Agnes AI 视频适配器
// v1.0
// API 文档: https://wiki.agnes-ai.com/zh-Hans/docs/agnes-video-v20
// 注意：异步任务 API，先创建任务，再通过 video_id 获取结果

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerVideoFactory } from '../registry';
import { enhanceVideoPrompt } from '../../prompts/videoQuality';

export class AgnesVideoAdapter implements VideoAdapter {
  readonly provider = 'agnes';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'agnes-video-v2.0';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://apihub.agnes-ai.com').replace(/\/$/, '');
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    // 增强提示词
    const basePrompt = params.motion || params.prompt || '';
    const isAction = /打斗|攻击|打|踢|拳|鞭|战斗|追逐|跑|跳|摔|撞|fight|attack|punch|kick|whip|chase|run|jump/i.test(basePrompt);
    const { prompt: enhancedPrompt } = enhanceVideoPrompt(basePrompt, {
      isActionScene: isAction,
      includeQuality: true,
      includeConsistency: true,
    });

    // Agnes prompt限制，超长则截断
    const prompt = enhancedPrompt.length > 2000 ? enhancedPrompt.substring(0, 1997) + '...' : enhancedPrompt;

    // 视频时长由 num_frames 和 frame_rate 控制
    // 约5秒: num_frames=121, frame_rate=24
    const duration = params.duration || 5;
    let numFrames = 121; // 默认5秒
    if (duration <= 3) numFrames = 81;   // 约3秒
    else if (duration <= 5) numFrames = 121; // 约5秒
    else if (duration <= 10) numFrames = 241; // 约10秒
    else numFrames = 441; // 约18秒（最大）

    const frameRate = 24;

    // 分辨率：根据宽高比计算
    // 默认 1152x768 (16:9, 720p)
    let width = 1152;
    let height = 768;
    const ratio = params.ratio || '16:9';
    if (ratio === '9:16') {
      width = 768;
      height = 1152;
    } else if (ratio === '1:1') {
      width = 1024;
      height = 1024;
    } else if (ratio === '4:3') {
      width = 1024;
      height = 768;
    } else if (ratio === '3:4') {
      width = 768;
      height = 1024;
    }

    // 构建请求体
    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt,
      width,
      height,
      num_frames: numFrames,
      frame_rate: frameRate,
    };

    // 图生视频：添加 image 参数
    if (params.firstFrameImageUrl) {
      body.image = params.firstFrameImageUrl;
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/v1/videos`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      // Agnes响应结构：{ id, task_id, video_id, status, progress, ... }
      const taskId =
        data?.video_id ||
        data?.task_id ||
        data?.id ||
        '';

      if (!taskId) {
        const errorMsg = data?.message || data?.error?.message || '未知错误';
        throw new AIError('AI_CALL_FAILED', `Agnes视频生成任务创建失败：${errorMsg}`);
      }

      return {
        taskId,
        status: 'pending',
        estimatedTimeSeconds: 120,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Agnes视频生成调用失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      // 推荐方式：使用 video_id 查询
      const data = await httpRequest<any>(
        `${this.baseUrl}/agnesapi?video_id=${encodeURIComponent(taskId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Agnes查询响应：{ status, metadata: { url }, ... }
      const rawStatus =
        data?.status ||
        data?.task_status ||
        'pending';

      let mappedStatus: VideoGenerateResult['status'] = 'processing';
      const statusLower = String(rawStatus).toLowerCase();
      if (
        statusLower === 'completed' ||
        statusLower === 'success' ||
        statusLower === 'succeeded' ||
        statusLower === 'done'
      ) {
        mappedStatus = 'completed';
      } else if (
        statusLower === 'failed' ||
        statusLower === 'error' ||
        statusLower === 'canceled' ||
        statusLower === 'cancelled'
      ) {
        mappedStatus = 'failed';
      } else if (
        statusLower === 'queued' ||
        statusLower === 'pending' ||
        statusLower === 'submitted'
      ) {
        mappedStatus = 'pending';
      }

      // 视频URL：metadata.url
      const videoUrl =
        data?.metadata?.url ||
        data?.video_url ||
        data?.url ||
        '';

      // 错误信息
      const errorMsg =
        data?.error?.message ||
        data?.error_message ||
        data?.message ||
        '';

      return {
        taskId,
        status: mappedStatus,
        videoUrl: videoUrl || undefined,
        error: mappedStatus === 'failed' ? (errorMsg || '视频生成失败') : undefined,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Agnes视频任务查询失败: ${(err as Error).message}`);
    }
  }
}

registerVideoFactory('agnes', (modelName, apiKey, endpointUrl) => {
  return new AgnesVideoAdapter(modelName, apiKey, endpointUrl);
});
