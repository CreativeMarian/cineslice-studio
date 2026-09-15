// 字节豆包视频适配器（火山引擎 Seedance）
// v1.1 - 支持一致性参考图注入（角色定妆照/场景/道具）+ 首尾帧插值
// API 文档: https://www.volcengine.com/docs/82379/1399438

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerVideoFactory } from '../registry';
import { enhanceVideoPrompt } from '../../prompts/videoQuality';

export class DoubaoVideoAdapter implements VideoAdapter {
  readonly provider = 'doubao';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'doubao-seedance-1-0-pro-250528';
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    const content: Array<Record<string, unknown>> = [];

    // 统一去AI味提示词增强（公共模块）
    const basePrompt = params.motion || params.prompt || '';
    const isAction = /打斗|攻击|打|踢|拳|鞭|战斗|追逐|跑|跳|摔|撞|fight|attack|punch|kick|whip|chase|run|jump/i.test(basePrompt);
    const { prompt: motionText, negativePrompt } = enhanceVideoPrompt(basePrompt, { isActionScene: isAction });

    // 文本提示词
    // Combine into single text (official API max 1 text)
let combinedPrompt = motionText || '';
if (negativePrompt) { combinedPrompt += '\nNegative: ' + negativePrompt; }
if (combinedPrompt) { content.push({ type: 'text', text: combinedPrompt }); }

    // 负面提示词（Seedance 支持 negative_prompt 字段）
    // negativePrompt merged into combinedPrompt above

    // 首帧图片（图生视频）
    const isR2V = !!params.firstFrameImageUrl;
    if (isR2V) {
      // 一致性参考图（角色定妆照/场景/道具）：先注入参考约束，再注入首帧。
      // 多参考图会显著降低人物/场景漂移（参考 ArcReel/BigBanana 资产约束方案）。
      // 限制最多 2 张参考图，避免超出 Seedance 单任务图片数上限。
      const refImages = (params.referenceImages || []).slice(0, 2);
      for (const refUrl of refImages) {
        content.push({
          type: 'image_url',
          image_url: { url: refUrl },
          role: 'reference_image',
        });
      }
      content.push({
        type: 'image_url',
        image_url: { url: params.firstFrameImageUrl },
        role: 'reference_image',
      });
    }

    // 尾帧图片（首尾帧插值）
    if (params.lastFrameImageUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: params.lastFrameImageUrl },
        role: 'last_frame',
      });
    }

    // r2v 模式各版本支持的 duration 值不同，超范围会报 InvalidParameter：
    // - Seedance 2.5：仅 5/10/11 秒
    // - Seedance 2.0 / 2.0 Mini / 2.0 Fast：5/10/15 秒（官方 4-15s 区间，整档按 5/10/15）
    // 修正为最接近的支持值，t2v 模式不受此限制
    let duration = params.duration || 5;
    if (isR2V) {
      const supportedDurations = /2-5/.test(this.modelName)
        ? [5, 10, 11]
        : [5, 10, 15];
      if (!supportedDurations.includes(duration)) {
        // 找到最接近的支持值
        duration = supportedDurations.reduce((prev, curr) =>
          Math.abs(curr - duration) < Math.abs(prev - duration) ? curr : prev
        );
      }
    }

    const body: Record<string, unknown> = {
      model: this.modelName,
      content,
      ratio: params.ratio || '16:9',
      duration,
      task_type: isR2V ? 'r2v' : 't2v',
      generate_audio: true,
      watermark: false,
    };

    // 分辨率参数（Seedance 支持 480p/720p/1080p）
    if (params.resolution) {
      body.resolution = params.resolution;
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/contents/generations/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body,
      });

      const taskId = data.id || data.task_id || '';
      if (!taskId) {
        throw new AIError('AI_CALL_FAILED', '视频生成任务创建失败：未返回任务 ID');
      }

      return {
        taskId,
        status: 'pending',
        estimatedTimeSeconds: 60,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `豆包视频生成调用失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      const data = await httpRequest<any>(
        `${this.baseUrl}/contents/generations/tasks/${taskId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }
      );

      const status = data.status || 'processing';
      let mappedStatus: VideoGenerateResult['status'] = 'processing';

      if (status === 'succeeded' || status === 'completed') {
        mappedStatus = 'completed';
      } else if (status === 'failed' || status === 'error') {
        mappedStatus = 'failed';
      } else if (status === 'pending' || status === 'queued') {
        mappedStatus = 'pending';
      }

      const videoUrl = data.content?.video_url || data.content?.url || data.video_url || data.output?.video_url || '';

      return {
        taskId,
        status: mappedStatus,
        videoUrl: videoUrl || undefined,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `视频任务查询失败: ${(err as Error).message}`);
    }
  }
}

registerVideoFactory('doubao', (modelName, apiKey, endpointUrl) => {
  return new DoubaoVideoAdapter(modelName, apiKey, endpointUrl);
});
