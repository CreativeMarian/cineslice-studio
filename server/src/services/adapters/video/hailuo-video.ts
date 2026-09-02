// 海螺 Hailuo 视频适配器（MiniMax）
// v1.2
// API 文档: https://platform.minimaxi.com/docs/api-reference/video-generation-i2v
// 官方接口: POST /v1/video_generation, GET /v1/query/video_generation?task_id=xxx
// 注意：海螺prompt最大2000字符，resolution为768P/1080P，支持[指令]运镜语法

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerVideoFactory } from '../registry';
import { enhanceVideoPrompt } from '../../prompts/videoQuality';

export class HailuoVideoAdapter implements VideoAdapter {
  readonly provider = 'hailuo';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'hailuo-02';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://api.minimaxi.com/v1').replace(/\/$/, '');
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    // 海螺prompt最大2000字符，使用简化版增强
    const basePrompt = params.motion || params.prompt || '';
    const isAction = /打斗|攻击|打|踢|拳|鞭|战斗|追逐|跑|跳|摔|撞|fight|attack|punch|kick|whip|chase|run|jump/i.test(basePrompt);
    const { prompt: enhancedPrompt } = enhanceVideoPrompt(basePrompt, { 
      isActionScene: isAction,
      includeQuality: false, // 海螺不需要电影级画质描述
      includeConsistency: true,
    });

    // 海螺prompt限制2000字符，超长则截断
    const prompt = enhancedPrompt.length > 2000 ? enhancedPrompt.substring(0, 1997) + '...' : enhancedPrompt;

    // 海螺resolution为768P或1080P，转换格式
    let resolution = params.resolution || '768P';
    if (resolution === '720p') resolution = '768P';
    if (resolution === '1080p') resolution = '1080P';

    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt,
      duration: params.duration || 5,
      resolution,
    };

    // 图生视频：海螺使用 image 字段（官方确认）
    if (params.firstFrameImageUrl) {
      body.image = params.firstFrameImageUrl;
      // 尾帧图片
      if (params.lastFrameImageUrl) {
        body.end_image = params.lastFrameImageUrl;
      }
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/video_generation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      // 兼容多种响应结构：{ task_id } / { data: { task_id } } / { id } / { data: { id } }
      const taskId =
        data?.task_id ||
        data?.data?.task_id ||
        data?.id ||
        data?.data?.id ||
        '';

      if (!taskId) {
        throw new AIError('AI_CALL_FAILED', '海螺视频生成任务创建失败：未返回任务 ID');
      }

      return {
        taskId,
        status: 'pending',
        estimatedTimeSeconds: 120,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `海螺视频生成调用失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      const data = await httpRequest<any>(
        `${this.baseUrl}/query/video_generation?task_id=${taskId}`,
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
        data?.status ||
        data?.data?.status ||
        data?.task_status ||
        data?.data?.task_status ||
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
        taskResult?.file?.url ||
        '';

      return {
        taskId,
        status: mappedStatus,
        videoUrl: videoUrl || undefined,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `海螺视频任务查询失败: ${(err as Error).message}`);
    }
  }
}

registerVideoFactory('hailuo', (modelName, apiKey, endpointUrl) => {
  return new HailuoVideoAdapter(modelName, apiKey, endpointUrl);
});
