// 硅基流动 SiliconFlow 文本适配器
// v1.0 - OpenAI 兼容接口，支持 Qwen/DeepSeek/Llama/GLM 等多种模型
// API 文档: https://docs.siliconflow.cn/

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';

export class SiliconFlowTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('siliconflow', modelName, apiKey, baseUrl || 'https://api.siliconflow.cn/v1');
  }
}

registerTextFactory('siliconflow', (modelName, apiKey, endpointUrl) => {
  return new SiliconFlowTextAdapter(modelName, apiKey, endpointUrl);
});
