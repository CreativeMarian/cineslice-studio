// ComfyUI 视频适配器
// v1.0 - 通过 ComfyUI 本地 API 生成视频
// 工作流：加载模板 → 替换提示词占位符 → 上传首帧 → POST /prompt → 轮询 /history → 返回 /view 视频URL
// 模型配置约定：
//   provider = 'comfyui'
//   endpoint_url = ComfyUI 地址（如 http://127.0.0.1:8188）
//   modelName = 工作流文件名（如 wan2.1-video.json），从 data/comfyui-workflows/ 目录加载
//   api_key = 留空（ComfyUI 本地无需鉴权）

import type { VideoAdapter, VideoGenerateParams, VideoGenerateResult } from '../base';
import { AIError } from '../base';
import { registerVideoFactory } from '../registry';
import * as fs from 'fs';
import * as path from 'path';

const WORKFLOW_DIR = path.resolve(process.cwd(), 'data', 'comfyui-workflows');

export class ComfyUIVideoAdapter implements VideoAdapter {
  readonly provider = 'comfyui';
  readonly modelName: string;
  private baseUrl: string;
  private workflowPath: string;

  constructor(modelName: string, _apiKey: string, endpointUrl?: string) {
    this.modelName = modelName || 'default-video.json';
    this.baseUrl = (endpointUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    this.workflowPath = path.join(WORKFLOW_DIR, this.modelName);
  }

  async generate(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    try {
      // 1. 加载工作流模板
      const workflow = this.loadWorkflow();

      // 2. 替换占位符
      const positive = params.motion || params.prompt || '';
      const negative = this.extractNegative(positive);
      const seed = Math.floor(Math.random() * 1e15);
      const { width, height } = this.parseRatio(params.ratio || '16:9');

      let workflowStr = JSON.stringify(workflow);
      workflowStr = workflowStr
        .replace(/\{\{POSITIVE_PROMPT\}\}/g, this.escapeJson(positive))
        .replace(/\{\{NEGATIVE_PROMPT\}\}/g, this.escapeJson(negative))
        .replace(/\{\{SEED\}\}/g, String(seed))
        .replace(/\{\{WIDTH\}\}/g, String(width))
        .replace(/\{\{HEIGHT\}\}/g, String(height))
        .replace(/\{\{FPS\}\}/g, String(params.duration && params.duration <= 3 ? 16 : 8));

      const filledWorkflow = JSON.parse(workflowStr);

      // 3. 上传首帧（图生视频）
      if (params.firstFrameImageUrl) {
        const imageName = await this.uploadFirstFrame(params.firstFrameImageUrl);
        this.injectImageToWorkflow(filledWorkflow, imageName);
        console.log(`[ComfyUI] 首帧已上传: ${imageName}`);
      }

      // 4. 提交工作流
      const promptId = await this.submitPrompt(filledWorkflow);
      console.log(`[ComfyUI] 工作流已提交, prompt_id=${promptId}`);

      return {
        taskId: promptId,
        status: 'pending',
        estimatedTimeSeconds: 180,
      };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `ComfyUI生成失败: ${(err as Error).message}`);
    }
  }

  async getTask(taskId: string): Promise<VideoGenerateResult> {
    try {
      const res = await this.httpGet(`/history/${encodeURIComponent(taskId)}`);
      const history = JSON.parse(res);
      const record = history[taskId];

      if (!record) {
        return { taskId, status: 'processing' };
      }

      const statusStr = record.status?.status_str || '';

      if (statusStr === 'error') {
        const messages = record.status?.messages || [];
        const errorMsg = messages.map((m: any) => JSON.stringify(m)).join('; ') || 'ComfyUI执行错误';
        return { taskId, status: 'failed', error: errorMsg };
      }

      if (statusStr === 'success' && record.outputs) {
        const videoFilename = this.findVideoOutput(record.outputs);
        if (videoFilename) {
          const videoUrl = `${this.baseUrl}/view?filename=${encodeURIComponent(videoFilename)}&type=output`;
          return { taskId, status: 'completed', videoUrl };
        }
        // 成功但没找到视频文件，可能还在保存中
        return { taskId, status: 'processing' };
      }

      return { taskId, status: 'processing' };
    } catch (err) {
      if (err instanceof AIError) throw err;
      throw new AIError('AI_CALL_FAILED', `ComfyUI任务查询失败: ${(err as Error).message}`);
    }
  }

  // ============ 内部方法 ============

  private loadWorkflow(): any {
    if (!fs.existsSync(this.workflowPath)) {
      // 如果指定工作流不存在，列出可用的工作流
      const available = fs.existsSync(WORKFLOW_DIR)
        ? fs.readdirSync(WORKFLOW_DIR).filter(f => f.endsWith('.json'))
        : [];
      throw new AIError(
        'AI_CALL_FAILED',
        `ComfyUI工作流文件不存在: ${this.workflowPath}\n可用工作流: ${available.join(', ') || '无'}\n请将工作流JSON文件放入 data/comfyui-workflows/ 目录`
      );
    }
    const raw = fs.readFileSync(this.workflowPath, 'utf-8');
    try {
      return JSON.parse(raw);
    } catch {
      throw new AIError('AI_CALL_FAILED', `ComfyUI工作流文件不是有效的JSON: ${this.workflowPath}`);
    }
  }

  private extractNegative(prompt: string): string {
    // 从合并提示词中提取负面提示词部分
    const marker = '【负面提示词·绝对避免】';
    const idx = prompt.indexOf(marker);
    if (idx >= 0) {
      return prompt.substring(idx + marker.length).trim();
    }
    return 'blurry, low quality, distorted, deformed, ugly, watermark, text';
  }

  private parseRatio(ratio: string): { width: number; height: number } {
    const map: Record<string, [number, number]> = {
      '16:9': [1280, 720],
      '9:16': [720, 1280],
      '1:1': [768, 768],
      '4:3': [1024, 768],
      '3:4': [768, 1024],
      '21:9': [1280, 544],
    };
    const [w, h] = map[ratio] || [1280, 720];
    return { width: w, height: h };
  }

  private escapeJson(str: string): string {
    // 替换占位符时需要转义，因为是在 JSON.stringify 后的字符串上替换
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  private async uploadFirstFrame(dataUrl: string): Promise<string> {
    // dataUrl 可能是 base64 data URL 或 http URL
    let buffer: Buffer;
    let filename: string;

    if (dataUrl.startsWith('data:')) {
      const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!match) throw new AIError('AI_CALL_FAILED', '无效的首帧图片数据格式');
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      buffer = Buffer.from(match[2], 'base64');
      filename = `cineslice_first_${Date.now()}.${ext}`;
    } else {
      // HTTP URL，先下载
      const res = await fetch(dataUrl);
      buffer = Buffer.from(await res.arrayBuffer());
      filename = `cineslice_first_${Date.now()}.png`;
    }

    const boundary = `----CineSlice${Date.now()}`;
    const pre = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    );
    const post = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([pre, buffer, post]);

    const res = await this.httpPostRaw('/upload/image', body, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    });
    const data = JSON.parse(res);
    return data.name;
  }

  private injectImageToWorkflow(workflow: any, imageName: string): void {
    for (const nodeId of Object.keys(workflow)) {
      const node = workflow[nodeId];
      if (node.class_type === 'LoadImage' && node.inputs) {
        node.inputs.image = imageName;
      }
    }
  }

  private async submitPrompt(workflow: any): Promise<string> {
    const body = JSON.stringify({ prompt: workflow, client_id: 'cineslice' });
    const res = await this.httpPost('/prompt', body);
    const data = JSON.parse(res);

    if (data.error) {
      throw new AIError('AI_CALL_FAILED', `ComfyUI提交失败: ${JSON.stringify(data.error)}`);
    }
    if (data.node_errors && Object.keys(data.node_errors).length > 0) {
      throw new AIError('AI_CALL_FAILED', `工作流节点错误: ${JSON.stringify(data.node_errors)}`);
    }
    if (!data.prompt_id) {
      throw new AIError('AI_CALL_FAILED', `ComfyUI返回无prompt_id: ${res.substring(0, 300)}`);
    }
    return data.prompt_id;
  }

  private findVideoOutput(outputs: any): string | null {
    for (const nodeId of Object.keys(outputs)) {
      const output = outputs[nodeId];
      // VHS_VideoCombine 输出在 gifs 字段，其他可能在 videos 或 images
      const candidates = output.gifs || output.videos || output.images || [];
      for (const item of candidates) {
        if (item.filename && /\.(mp4|webm|mov|avi|mkv)$/i.test(item.filename)) {
          return item.filename;
        }
      }
    }
    // 如果没有视频文件，返回第一个输出（可能是图片序列）
    for (const nodeId of Object.keys(outputs)) {
      const output = outputs[nodeId];
      const candidates = output.gifs || output.videos || output.images || [];
      if (candidates.length > 0 && candidates[0].filename) {
        return candidates[0].filename;
      }
    }
    return null;
  }

  // ============ HTTP 工具 ============

  private httpGet(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const req = require('http').request(
        { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET' },
        (res: any) => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c));
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', (e: Error) => reject(new AIError('AI_CALL_FAILED', `无法连接ComfyUI(${this.baseUrl}): ${e.message}`)));
      req.setTimeout(30000, () => { req.destroy(); reject(new AIError('AI_CALL_FAILED', 'ComfyUI请求超时')); });
      req.end();
    });
  }

  private httpPost(path: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const req = require('http').request(
        {
          hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        },
        (res: any) => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c));
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', (e: Error) => reject(new AIError('AI_CALL_FAILED', `无法连接ComfyUI(${this.baseUrl}): ${e.message}`)));
      req.setTimeout(30000, () => { req.destroy(); reject(new AIError('AI_CALL_FAILED', 'ComfyUI请求超时')); });
      req.write(body);
      req.end();
    });
  }

  private httpPostRaw(path: string, body: Buffer, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + path);
      const req = require('http').request(
        {
          hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'POST',
          headers: { ...headers, 'Content-Length': body.length },
        },
        (res: any) => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c));
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', (e: Error) => reject(new AIError('AI_CALL_FAILED', `无法连接ComfyUI(${this.baseUrl}): ${e.message}`)));
      req.setTimeout(60000, () => { req.destroy(); reject(new AIError('AI_CALL_FAILED', 'ComfyUI上传超时')); });
      req.write(body);
      req.end();
    });
  }
}

registerVideoFactory('comfyui', (modelName, apiKey, endpointUrl) => {
  return new ComfyUIVideoAdapter(modelName, apiKey, endpointUrl);
});
