// 阿里通义千问文本适配器（DashScope）
// v1.0 - 支持 Qwen-Max, Qwen-Plus, Qwen-Turbo 等，OpenAI 兼容接口

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';

export class QwenTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('qwen', modelName, apiKey, baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  }
}

registerTextFactory('qwen', (modelName, apiKey, endpointUrl) => {
  return new QwenTextAdapter(modelName, apiKey, endpointUrl);
});
