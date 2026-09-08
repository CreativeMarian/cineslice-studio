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
import * as http from 'http';

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
      // 1. 加载工作流模板（有首帧时优先使用 ref2va 模板，规避 MiniMaxH3ImageToVideo 的 keyframes latent 打包不兼容）
      const workflow = this.selectWorkflow(!!params.firstFrameImageUrl);

      // 2. 替换占位符
      const positive = params.motion || params.prompt || '';
      const negative = this.extractNegative(positive);
      const seed = Math.floor(Math.random() * 1e15);
      const { width, height } = this.parseRatio(params.ratio || '16:9');

      // 固定时长：统一按请求时长（默认 5 秒），保证单镜渲染耗时可控
      const duration = params.duration || 5;

      let workflowStr = JSON.stringify(workflow);
      workflowStr = workflowStr
        .replace(/\{\{POSITIVE_PROMPT\}\}/g, this.escapeJson(positive))
        .replace(/\{\{NEGATIVE_PROMPT\}\}/g, this.escapeJson(negative))
        .replace(/\{\{SEED\}\}/g, String(seed))
        .replace(/\{\{WIDTH\}\}/g, String(width))
        .replace(/\{\{HEIGHT\}\}/g, String(height))
        .replace(/\{\{DURATION_SECONDS\}\}/g, String(duration))
        .replace(/\{\{FPS\}\}/g, String(duration <= 3 ? 16 : 8));

      const filledWorkflow = JSON.parse(workflowStr);

      // 3. 参考图处理：首帧 + 一致性参考图（角色概念图/造型图/场景图）全部注入 ref_images
      //    多图参考 = 人物/场景跨镜锚定，解决角色漂移
      const imageUrls: string[] = [];
      if (params.firstFrameImageUrl) imageUrls.push(params.firstFrameImageUrl);
      if (Array.isArray(params.referenceImages)) {
        for (const ref of params.referenceImages) {
          if (!ref) continue;
          if (!imageUrls.some(u => u === ref)) imageUrls.push(ref);
        }
      }
      if (imageUrls.length > 0) {
        const names: string[] = [];
        for (const url of imageUrls) {
          const name = await this.uploadFirstFrame(url, width, height);
          if (!names.includes(name)) names.push(name);
        }
        this.injectImageToWorkflow(filledWorkflow, names);
        console.log(`[ComfyUI] 参考图已上传 ${names.length} 张: ${names.join(', ')} (${width}x${height})`);
      } else {
        this.removeImageNodes(filledWorkflow);
        console.log('[ComfyUI] 无参考图，已切换为文生视频模式');
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

  private selectWorkflow(hasFirstFrame: boolean): any {
    if (hasFirstFrame && this.modelName.includes('minimax-h3-video')) {
      const refPath = path.join(WORKFLOW_DIR, 'minimax-h3-ref2va.json');
      if (fs.existsSync(refPath)) {
        this.workflowPath = refPath;
      }
    }
    return this.loadWorkflow();
  }

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

  private async uploadFirstFrame(dataUrl: string, width: number, height: number): Promise<string> {
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
      // HTTP URL / 相对路径，先下载（相对路径指向本服务后端静态目录）
      let target = dataUrl;
      if (!/^https?:\/\//i.test(target)) {
        const port = process.env.PORT || '3000';
        target = `http://127.0.0.1:${port}${target.startsWith('/') ? '' : '/'}${target}`;
      }
      const res = await fetch(target);
      if (!res.ok) throw new AIError('AI_CALL_FAILED', `参考图下载失败: ${res.status} ${target}`);
      buffer = Buffer.from(await res.arrayBuffer());
      filename = `cineslice_first_${Date.now()}.png`;
    }

    // 关键：首帧必须与视频输出分辨率一致（MiniMaxH3 latent 尺寸强校验），
    // 用 ffmpeg 强制缩放到 width x height，避免 latent shape 不匹配报错
    try {
      const tmpIn = path.join(WORKFLOW_DIR, `.first_in_${Date.now()}.png`);
      const tmpOut = path.join(WORKFLOW_DIR, `.first_resized_${Date.now()}.png`);
      fs.writeFileSync(tmpIn, buffer);
      const { execFileSync } = require('child_process') as typeof import('child_process');
      execFileSync('ffmpeg', ['-y', '-i', tmpIn, '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`, tmpOut], { stdio: 'pipe' });
      buffer = fs.readFileSync(tmpOut);
      fs.unlinkSync(tmpIn);
      fs.unlinkSync(tmpOut);
      filename = `cineslice_first_${Date.now()}.png`;
    } catch (e) {
      console.warn(`[ComfyUI] 首帧尺寸对齐失败，按原图上传: ${(e as Error).message}`);
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

  private injectImageToWorkflow(workflow: any, imageNames: string[]): void {
    const loadImageIds: string[] = [];
    for (let i = 0; i < imageNames.length; i++) {
      const nodeId = 'loadimg_' + i;
      if (!workflow[nodeId]) {
        // 每个参考图一个 LoadImage 节点（模板原本可能只有 1 个，按需扩展）
        workflow[nodeId] = {
          class_type: 'LoadImage',
          inputs: { image: imageNames[i] },
          _meta: { title: '一致性参考图 ' + (i + 1) },
        };
      } else {
        workflow[nodeId].inputs.image = imageNames[i];
      }
      loadImageIds.push(nodeId);
    }
    // 处理模板自带的首个 LoadImage 节点（ref2va 模板里的 200）
    for (const nodeId of Object.keys(workflow)) {
      const node = workflow[nodeId];
      if (node.class_type === 'LoadImage' && node.inputs && !nodeId.startsWith('loadimg_')) {
        node.inputs.image = imageNames[0] || node.inputs.image;
        if (!loadImageIds.includes(nodeId)) loadImageIds.unshift(nodeId);
        break;
      }
    }
    // 连接到生成类节点：
    // MiniMaxH3ReferenceToVideo 用 ref_images 数组（多参考，人物/场景一致性）
    // 其他 ImageToVideo 类节点用 first_frame
    for (const nodeId of Object.keys(workflow)) {
      const node = workflow[nodeId];
      if (!node || !node.inputs) continue;
      if (node.class_type === 'MiniMaxH3ReferenceToVideo') {
        node.inputs.ref_images = loadImageIds.map(id => [id, 0]);
        continue;
      }
      if (node.class_type && /ImageToVideo|Image2Video|I2V/i.test(node.class_type)) {
        if (node.inputs.first_frame === undefined || node.inputs.first_frame === null) {
          node.inputs.first_frame = [loadImageIds[0], 0];
        }
      }
    }
  }

  private removeImageNodes(workflow: any): void {
    const loadImageIds = new Set<string>();
    for (const nodeId of Object.keys(workflow)) {
      if (workflow[nodeId].class_type === 'LoadImage') loadImageIds.add(nodeId);
    }
    for (const nodeId of loadImageIds) delete workflow[nodeId];
    for (const nodeId of Object.keys(workflow)) {
      const node = workflow[nodeId];
      if (!node || !node.inputs) continue;
      for (const key of Object.keys(node.inputs)) {
        const v = node.inputs[key];
        if (Array.isArray(v) && v.length === 2 && loadImageIds.has(String(v[0]))) {
          delete node.inputs[key];
        }
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
      const req = http.request(
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
      const req = http.request(
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
      const req = http.request(
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
