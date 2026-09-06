// 智谱 CogView 图像适配器
// v1.0

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class ZhipuImageAdapter implements ImageAdapter {
  readonly provider = 'zhipu';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'cogview-4';
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    // CogView limit: side 512-2880, multiple of 16, total px <= 2^21
    const clampSize = (raw: string | undefined): string => {
      const size = raw || '1024x1024';
      const [w, h] = size.split('x').map(Number);
      if (!w || !h || w * h <= 2097152) return size;
      const scale = Math.sqrt(2097152 / (w * h));
      const nw = Math.max(512, Math.min(2880, Math.floor((w * scale) / 16) * 16));
      const nh = Math.max(512, Math.min(2880, Math.floor((h * scale) / 16) * 16));
      return nw + 'x' + nh;
    };
    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt: params.prompt,
      size: clampSize(params.size),
      n: params.count || 1,
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    try {
      const data = await httpRequest<any>(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body,
      });

      const images = (data.data || []).map((item: any) => ({
        url: item.url || item.b64_json || '',
        prompt: params.prompt,
      }));

      return { images, model: this.modelName, raw: data };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `CogView 调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('zhipu', (modelName, apiKey, endpointUrl) => {
  return new ZhipuImageAdapter(modelName, apiKey, endpointUrl);
});
// 向后兼容：保留 zhipu-image 别名
registerImageFactory('zhipu-image', (modelName, apiKey, endpointUrl) => {
  return new ZhipuImageAdapter(modelName, apiKey, endpointUrl);
});
