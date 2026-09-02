// DeepSeek 文本适配器
// v1.1 - 支持 DeepSeek V3, DeepSeek R1，OpenAI 兼容接口
// R1 推理模型不支持 response_format 参数

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';
import type { TextGenerateParams, TextGenerateResult } from '../base';

export class DeepSeekTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('deepseek', modelName, apiKey, baseUrl || 'https://api.deepseek.com/v1');
  }

  async generate(params: TextGenerateParams): Promise<TextGenerateResult> {
    // DeepSeek R1 推理模型不支持 response_format，自动移除
    const isReasoningModel = /r1|reasoner|deepseek-reasoner/i.test(this.modelName);
    if (isReasoningModel && params.responseFormat === 'json') {
      const { responseFormat, ...rest } = params;
      return super.generate(rest);
    }
    return super.generate(params);
  }
}

registerTextFactory('deepseek', (modelName, apiKey, endpointUrl) => {
  return new DeepSeekTextAdapter(modelName, apiKey, endpointUrl);
});
