// MiniMax 文本适配器
// v1.0 - 支持 abab6.5 等，OpenAI 兼容接口

import { OpenAICompatibleTextAdapter } from './openai';
import { registerTextFactory } from '../registry';

export class MiniMaxTextAdapter extends OpenAICompatibleTextAdapter {
  constructor(modelName: string, apiKey: string, baseUrl?: string) {
    super('minimax', modelName, apiKey, baseUrl || 'https://api.minimaxi.com/v1');
  }
}

registerTextFactory('minimax', (modelName, apiKey, endpointUrl) => {
  return new MiniMaxTextAdapter(modelName, apiKey, endpointUrl);
});
