// 网络下载工具：统一超时、状态校验、大小上限与流式落盘
// v1.0 —— 替换裸 fetch + arrayBuffer（无超时会把管线 worker 永久挂起，
// 无状态校验会把 S3 错误 XML 当视频落盘，全量缓冲会吃爆内存）

import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export interface DownloadOptions {
  /** 超时毫秒数，默认 120s */
  timeoutMs?: number;
  /** 最大字节数，超过即中止并抛错；默认 512MB */
  maxBytes?: number;
}

/**
 * 将远程 URL 内容下载到本地文件（流式写入，内存占用恒定）。
 * - HTTP 超时自动中止（默认 120 秒）
 * - 非 2xx 直接抛错（避免把错误响应体当媒体文件保存）
 * - 超过 maxBytes 抛错
 */
export async function downloadToFile(url: string, destPath: string, options: DownloadOptions = {}): Promise<void> {
  const { timeoutMs = 120_000, maxBytes = 512 * 1024 * 1024 } = options;

  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`下载失败 HTTP ${response.status}: ${url.slice(0, 200)}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error(`文件过大（${contentLength} 字节），超过上限 ${maxBytes}`);
  }

  if (!response.body) {
    throw new Error('下载失败：响应无内容');
  }

  let received = 0;
  const source = Readable.fromWeb(response.body as never);
  source.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (received > maxBytes) {
      source.destroy(new Error(`下载超出大小上限 ${maxBytes} 字节`));
    }
  });

  await pipeline(source, fs.createWriteStream(destPath));
}
