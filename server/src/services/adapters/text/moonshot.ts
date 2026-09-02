// 月之暗面 Kimi 文本适配器
// v1.0 - OpenAI 兼容接口

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';

export class MoonshotTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('moonshot', modelName, apiKey, baseUrl || 'https://api.moonshot.cn/v1');
  }
}

registerTextFactory('moonshot', (modelName, apiKey, endpointUrl) => {
  return new MoonshotTextAdapter(modelName, apiKey, endpointUrl);
});

// 别名：前端用 "kimi"，对应后端 moonshot 适配器
registerTextFactory('kimi', (modelName, apiKey, endpointUrl) => {
  return new MoonshotTextAdapter(modelName, apiKey, endpointUrl);
});
