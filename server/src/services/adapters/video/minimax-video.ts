// MiniMax H3 视频适配器 V2（MiniMax 海螺视频生成）
// v2.0
// API 文档: https://platform.minimaxi.com/docs/api-reference/video/generation/api/v2-video-generation
// 注意：使用V2 API，content数组多模态输入，支持文生视频/图生视频/多模态参考生视频

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerVideoFactory } from '../registry';
import { enhanceVideoPrompt } from '../../prompts/videoQuality';

export class MiniMaxVideoAdapter implements VideoAdapter {
  readonly provider = 'minimax';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'MiniMax-H3';
    this.apiKey = apiKey;
    // V2 API端点：https://api.minimaxi.com/v2/video_generation
    this.baseUrl = (endpointUrl || 'https://api.minimaxi.com/v2').replace(/\/$/, '');
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    // MiniMax V2 prompt最大7000字符，使用简化版增强
    const basePrompt = params.motion || params.prompt || '';
    const isAction = /打斗|攻击|打|踢|拳|鞭|战斗|追逐|跑|跳|摔|撞|fight|attack|punch|kick|whip|chase|run|jump/i.test(basePrompt);
    const { prompt: enhancedPrompt } = enhanceVideoPrompt(basePrompt, {
      isActionScene: isAction,
      includeQuality: false,
      includeConsistency: true,
    });

    // MiniMax V2 prompt限制7000字符，超长则截断
    const prompt = enhancedPrompt.length > 7000 ? enhancedPrompt.substring(0, 6997) + '...' : enhancedPrompt;

    // 构建content数组（V2 API必须使用content数组）
    const content: Array<Record<string, unknown>> = [];

    // 文本提示词（必填，所有场景都需包含一个非空text）
    content.push({
      type: 'text',
      text: prompt,
    });

    // 图生视频：首帧图片
    const isImageToVideo = !!params.firstFrameImageUrl;
    if (params.firstFrameImageUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: params.firstFrameImageUrl },
        role: 'first_frame',
      });
      // 尾帧图片（首尾帧模式）
      if (params.lastFrameImageUrl) {
        content.push({
          type: 'image_url',
          image_url: { url: params.lastFrameImageUrl },
          role: 'last_frame',
        });
      }
    }

    // MiniMax V2 resolution：768P 或 2K
    let resolution = params.resolution || '768P';
    if (resolution === '720p' || resolution === '720P') resolution = '768P';
    if (resolution === '1080p' || resolution === '1080P') resolution = '2K';
    if (resolution !== '768P' && resolution !== '2K') resolution = '768P';

    // duration：4~15秒整数
    let duration = params.duration || 5;
    if (duration < 4) duration = 4;
    if (duration > 15) duration = 15;
    duration = Math.round(duration);

    // ratio：文生视频必填具体比例，图生视频恒为adaptive
    let ratio: string = params.ratio || '16:9';
    if (isImageToVideo) {
      ratio = 'adaptive'; // 图生视频宽高比由输入图片决定
    }

    const body: Record<string, unknown> = {
      model: this.modelName,
      content,
      resolution,
      duration,
      ratio,
    };

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/video_generation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      // V2 API响应：{ task_id: "..." }
      const taskId =
        data?.task_id ||
        data?.data?.task_id ||
        data?.id ||
        data?.data?.id ||
        '';

      if (!taskId) {
        const errorMsg = data?.error?.message || data?.message || '未知错误';
        throw new AIError('AI_CALL_FAILED', `MiniMax V2 视频生成任务创建失败：${errorMsg}`);
      }

      return {
        taskId,
        status: 'pending',
        estimatedTimeSeconds: 120,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `MiniMax V2 视频生成调用失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      const data = await httpRequest<any>(
        `${this.baseUrl}/video_generation/${taskId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // V2 API查询响应：{ task: { id, status, content: { url }, ... } }
      const task = data?.task || data;
      const rawStatus =
        task?.status ||
        data?.status ||
        'processing';

      let mappedStatus: VideoGenerateResult['status'] = 'processing';
      const statusLower = String(rawStatus).toLowerCase();
      if (
        statusLower === 'succeeded' ||
        statusLower === 'completed' ||
        statusLower === 'success'
      ) {
        mappedStatus = 'completed';
      } else if (
        statusLower === 'failed' ||
        statusLower === 'error' ||
        statusLower === 'cancelled' ||
        statusLower === 'canceled'
      ) {
        mappedStatus = 'failed';
      } else if (
        statusLower === 'queued' ||
        statusLower === 'pending' ||
        statusLower === 'submitted'
      ) {
        mappedStatus = 'pending';
      }

      // V2 API视频URL：task.content.url
      const videoUrl =
        task?.content?.url ||
        task?.video_url ||
        task?.url ||
        data?.video_url ||
        data?.content?.url ||
        '';

      return {
        taskId,
        status: mappedStatus,
        videoUrl: videoUrl || undefined,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `MiniMax V2 视频任务查询失败: ${(err as Error).message}`);
    }
  }
}

registerVideoFactory('minimax', (modelName, apiKey, endpointUrl) => {
  return new MiniMaxVideoAdapter(modelName, apiKey, endpointUrl);
});
