// 硅基流动 SiliconFlow 图像适配器
// v1.0 - OpenAI 兼容接口，支持 FLUX/Kolors 等图像模型
// API 文档: https://docs.siliconflow.cn/

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpRequest } from '../base';
import { registerImageFactory } from '../registry';

export class SiliconFlowImageAdapter implements ImageAdapter {
  readonly provider = 'siliconflow';
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    this.modelName = modelName || 'black-forest-labs/FLUX.1-schnell';
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl || 'https://api.siliconflow.cn/v1').replace(/\/$/, '');
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const size = params.size || '1024x1024';
    const body: Record<string, unknown> = {
      model: this.modelName,
      prompt: params.prompt,
      n: params.count || 1,
      size,
      response_format: 'url',
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
        prompt: item.revised_prompt || params.prompt,
      }));

      return { images, model: this.modelName, raw: data };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `硅基流动图像生成调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('siliconflow', (modelName, apiKey, endpointUrl) => {
  return new SiliconFlowImageAdapter(modelName, apiKey, endpointUrl);
});
