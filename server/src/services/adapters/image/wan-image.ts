// Wan 2.7 Image Pro 图像适配器（阿里巴巴通义千问 / DashScope 万相）
// v1.0
// API 文档: https://www.qianwenai.com/models/wan2.7-image-pro
// 注意：DashScope图像生成是异步API，适配器内部轮询直到完成

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class WanImageAdapter implements ImageAdapter {
  readonly provider = 'wan';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'wan2.7-image-pro';
    this.apiKey = apiKey;
    this.baseUrl = (endpointUrl || 'https://dashscope.aliyuncs.com/api/v1').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const prompt = params.prompt || '';
    const negativePrompt = params.negativePrompt || '';

    // 尺寸转换：Wan支持 1024*1024, 720*1280, 1280*720, 2K 等
    let size = '1024*1024';
    if (params.size) {
      // 将标准尺寸转换为Wan格式
      const sizeMap: Record<string, string> = {
        '512x512': '512*512',
        '1024x1024': '1024*1024',
        '1024x1792': '1024*1792',
        '1792x1024': '1792*1024',
        '2048x2048': '2048*2048',
        '2048x1152': '2048*1152',
        '2560x1440': '2560*1440',
        '1440x2560': '1440*2560',
      };
      size = sizeMap[params.size] || params.size.replace('x', '*');
    }

    // 构建input
    const input: Record<string, unknown> = {
      prompt,
    };

    // 负面提示词
    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    // 参考图（图生图/多图参考）
    if (params.referenceImages && params.referenceImages.length > 0) {
      input.ref_img = params.referenceImages.map(imgUrl => ({
        image: imgUrl,
      }));
    }

    const body: Record<string, unknown> = {
      model: this.modelName,
      input,
      parameters: {
        size,
        n: params.count || 1,
        // Wan 2.7支持顺序生成（组图一致性）
        enable_sequential: (params.count || 1) > 1,
      },
    };

    try {
      // 第一步：创建异步任务
      const createData = await httpRequest<any>(`${this.baseUrl}/services/aigc/text2image/image-synthesis`, {
        method: 'POST',
        headers: {
          'X-DashScope-Async': 'enable',
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
      });

      const taskId =
        createData?.output?.task_id ||
        createData?.task_id ||
        '';

      if (!taskId) {
        const errorMsg = createData?.message || createData?.output?.message || '未知错误';
        throw new AIError('AI_CALL_FAILED', `Wan图像生成任务创建失败：${errorMsg}`);
      }

      // 第二步：轮询任务状态直到完成（最多等待120秒）
      const maxWait = 120000; // 120秒
      const interval = 3000; // 3秒轮询一次
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, interval));

        const queryData = await httpRequest<any>(
          `${this.baseUrl}/services/aigc/text2image/image-synthesis/${taskId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const rawStatus =
          queryData?.output?.task_status ||
          queryData?.task_status ||
          'PENDING';

        const statusUpper = String(rawStatus).toUpperCase();

        if (statusUpper === 'SUCCEEDED' || statusUpper === 'SUCCESS' || statusUpper === 'COMPLETED') {
          // 任务成功，提取图片URL
          const results = queryData?.output?.results || [];
          const images = results.map((r: { url?: string }) => ({
            url: r.url || '',
            prompt,
          })).filter((img: { url: string }) => img.url);

          if (images.length === 0) {
            throw new AIError('AI_CALL_FAILED', 'Wan图像生成成功但未返回图片URL');
          }

          return { images, model: this.modelName, raw: queryData };
        }

        if (statusUpper === 'FAILED' || statusUpper === 'ERROR' || statusUpper === 'CANCELED') {
          const errorMsg = queryData?.output?.message || queryData?.message || '任务失败';
          throw new AIError('AI_CALL_FAILED', `Wan图像生成任务失败：${errorMsg}`);
        }

        // 任务还在进行中，继续轮询
      }

      throw new AIError('AI_CALL_FAILED', 'Wan图像生成任务超时（超过120秒）');
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Wan图像生成调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('wan', (modelName, apiKey, endpointUrl) => {
  return new WanImageAdapter(modelName, apiKey, endpointUrl);
});
