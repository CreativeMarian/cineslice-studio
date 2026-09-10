// Pollinations.ai 免费图像适配器
// v1.1 - 完全免费、无需 API Key、支持 FLUX 系列模型
// API: GET https://image.pollinations.ai/prompt/{prompt}?width=..&height=..&model=flux&nologo=true&seed=..

import type { ImageAdapter, ImageGenerateParams, ImageGenerateResult } from '../base';
import { AIError, httpBinaryRequest } from '../base';
import { registerImageFactory } from '../registry';

export class PollinationsImageAdapter implements ImageAdapter {
  readonly provider = 'pollinations';
  readonly modelName: string;
  private baseUrl: string;

  constructor(modelName: string, _apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'flux';
    this.baseUrl = (endpointUrl || 'https://image.pollinations.ai').replace(/\/$/, '');
  }

  // 尺寸映射：项目尺寸 → Pollinations 宽高（限制在 2048 内，常用 1280x720）
  private mapSize(size?: string): { width: number; height: number } {
    if (size) {
      const m = size.toLowerCase().match(/^(\d+)x(\d+)$/);
      if (m) {
        let w = parseInt(m[1], 10);
        let h = parseInt(m[2], 10);
        // 超长边限制到 2048，保持比例
        const maxSide = 2048;
        if (w > maxSide || h > maxSide) {
          const scale = maxSide / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        return { width: w, height: h };
      }
    }
    return { width: 1280, height: 720 };
  }

  async generate(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    const { width, height } = this.mapSize(params.size);
    // 每次调用随机 seed，保证首尾帧画面有差异化
    const seed = Math.floor(Math.random() * 1e9);

    // 拼接 Pollinations URL
    let url = `${this.baseUrl}/prompt/${encodeURIComponent(params.prompt)}?width=${width}&height=${height}&model=${this.modelName}&nologo=true&seed=${seed}`;
    if (params.negativePrompt) {
      url += `&negative_prompt=${encodeURIComponent(params.negativePrompt)}`;
    }

    try {
      // 实际请求一次，验证可生成并返回图片二进制（错误时抛 AIError）
      await httpBinaryRequest(url, {
        method: 'GET',
        headers: { Accept: 'image/*' },
        timeout: 120000,
      });

      // 返回原 URL，由上层 downloadImage 拉取落盘
      return { images: [{ url, prompt: params.prompt }], model: this.modelName };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `Pollinations 图片生成调用失败: ${(err as Error).message}`);
    }
  }
}

registerImageFactory('pollinations', (modelName, apiKey, endpointUrl) => {
  return new PollinationsImageAdapter(modelName, apiKey, endpointUrl);
});
