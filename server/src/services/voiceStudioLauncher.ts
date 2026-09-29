// VoiceStudio 本地语音服务自动拉起（集成模式）
// v2.0
// 后端启动时确保 VoiceStudio 可用，全自动、不依赖用户手动安装：
//   1. 已在运行（3900 /health 在线）→ 直接复用
//   2. vendor/voicestudio 已就绪（.ready + backend/main.py）→ uv 拉起 Python 后端 → 轮询就绪
//   3. vendor 未安装 → 后台自动跑 npm run setup:voicestudio（clone + uv sync），完成后自动拉起
//   4. 服务就绪后 → 尝试预下载 OmniVoice 模型（约 2.4GB，失败不阻塞，首次生成时也会自动下载）
// 配置（.env / 环境变量）：
//   VOICESTUDIO_AUTO_START    '1' 启用（默认），'0' 关闭整个自动链路
//   VOICESTUDIO_AUTO_SETUP    '1' 允许自动安装（默认），'0' 未安装时只提示手动 npm run setup:voicestudio
//   VOICESTUDIO_URL           VoiceStudio 后端地址（默认 http://127.0.0.1:3900）
//   VOICESTUDIO_WAIT_SECONDS  就绪等待秒数（默认 180，后端 torch 重初始化需要时间）
//   VOICESTUDIO_EXEC          兜底：指定 Electron 应用/命令（源码模式优先于它）

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const DEFAULT_URL = 'http://127.0.0.1:3900';

function vendorRepoDir(): string {
  // server/src/services -> server/src -> server -> project root
  const here = path.resolve(__dirname);
  return path.resolve(here, '../../..', 'vendor', 'voicestudio');
}

export function voiceStudioUrl(): string {
  return (process.env.VOICESTUDIO_URL || DEFAULT_URL).replace(/\/+$/, '');
}

/** 探测 VoiceStudio 是否在线（/health 返回 200 即认为可用） */
export async function probeVoiceStudio(url = voiceStudioUrl()): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** 源码 vendor 是否已安装就绪 */
export function vendorReady(): { dir: string; ready: boolean } {
  const dir = vendorRepoDir();
  const ready =
    fs.existsSync(path.join(dir, '.ready')) &&
    fs.existsSync(path.join(dir, 'backend', 'main.py')) &&
    fs.existsSync(path.join(dir, '.venv'));
  return { dir, ready };
}

/** 按 VOICESTUDIO_EXEC 或常见安装路径查找 VoiceStudio 桌面应用启动命令（兜底） */
export function resolveVoiceStudioCommand(): { command: string; args: string[]; cwd?: string } | null {
  const explicit = process.env.VOICESTUDIO_EXEC?.trim();
  if (explicit) {
    const cleaned = explicit.replace(/^["']|["']$/g, '');
    if (fs.existsSync(cleaned)) return { command: cleaned, args: [] };
    const parts = cleaned.split(/\s+/);
    return { command: parts[0], args: parts.slice(1) };
  }
  const home = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const candidates = [
    path.join(home, 'Programs', 'VoiceStudio', 'VoiceStudio.exe'),
    path.join(home, 'Programs', 'voicestudio', 'VoiceStudio.exe'),
    path.join(home, 'Programs', 'VoiceStudio', 'voicestudio.exe'),
    path.join(programFiles, 'VoiceStudio', 'VoiceStudio.exe'),
    path.join(programFiles, 'VoiceStudio', 'voicestudio.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return { command: p, args: [] };
  }
  return null;
}

/** detached 拉起进程（独立于后端进程存活）。自动注入国内 HF 镜像（受限网络下
 *  huggingface.co 直连不可达；VOICESTUDIO_HF_ENDPOINT 可覆盖，空字符串则继承环境） */
function spawnDetached(command: string, args: string[], cwd?: string) {
  try {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (process.env.VOICESTUDIO_HF_ENDPOINT !== '') {
      env.HF_ENDPOINT =
        process.env.VOICESTUDIO_HF_ENDPOINT ||
        process.env.HF_ENDPOINT ||
        'https://hf-mirror.com';
    }
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return child;
  } catch (err) {
    console.error(`[VoiceStudio] 启动失败: ${(err as Error).message}`);
    return null;
  }
}

/** 轮询 /health 直到就绪，返回是否成功 */
export async function waitForVoiceStudio(url: string, waitSeconds: number): Promise<boolean> {
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    if (await probeVoiceStudio(url)) return true;
  }
  return false;
}

/** 服务就绪后尝试预下载 OmniVoice 模型（约 2.4GB）。接口细节容错，失败不阻塞。 */
async function ensureOmniVoiceModel(url: string): Promise<void> {
  try {
    const res = await fetch(`${url}/models`);
    if (!res.ok) return;
    const payload: unknown = await res.json();
    const list = Array.isArray(payload) ? payload : (payload as { models?: unknown[] }).models;
    if (!Array.isArray(list)) return;
    const target = list.find((m: any) => {
      const name = String(m?.name || m?.id || '').toLowerCase();
      return name.includes('omnivoice') && m?.installed === false;
    }) as any;
    if (!target) return; // 已安装或无需安装
    const repoId = target.repo_id || target.repoId;
    if (!repoId) return;
    console.log(`[VoiceStudio] 预下载 OmniVoice 模型（${repoId}，约 2.4GB）…`);
    await fetch(`${url}/models/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_id: repoId }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // 首次生成配音时也会自动触发模型下载，此处失败不影响链路
  }
}

/** 后台自动执行一键安装（clone + uv sync），完成后回调 */
function runAutoSetup(onDone: () => void, onError: (msg: string) => void): void {
  const setupScript = path.resolve(__dirname, '../scripts/setupVoiceStudio.mjs');
  if (!fs.existsSync(setupScript)) {
    onError('setupVoiceStudio.mjs 不存在');
    return;
  }
  console.log('[VoiceStudio] 未安装，后台自动执行一键安装（首次约 20-40 分钟，可稍后手动 npm run setup:voicestudio 查看进度）…');
  const child = spawn(process.execPath, [setupScript], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  child.on('exit', (code) => {
    if (code === 0) onDone();
    else onError(`一键安装退出码 ${code}`);
  });
}

/**
 * 后端启动入口：确保 VoiceStudio 可用。全程后台执行，不阻塞后端启动。
 */
export async function ensureVoiceStudio(): Promise<boolean> {
  if (process.env.VOICESTUDIO_AUTO_START === '0') {
    console.log('[VoiceStudio] 自动启动已关闭（VOICESTUDIO_AUTO_START=0）');
    return false;
  }
  const url = voiceStudioUrl();
  const waitSeconds = parseInt(process.env.VOICESTUDIO_WAIT_SECONDS || '180', 10);
  const tag = `[VoiceStudio] ${url}`;

  // 1. 已在运行 → 复用
  if (await probeVoiceStudio(url)) {
    console.log(`${tag} 已在运行，直接复用`);
    ensureOmniVoiceModel(url);
    return true;
  }

  // 2. vendor 源码模式
  const { dir: repoDir, ready } = vendorReady();
  if (ready) {
    console.log(`${tag} 未运行，正在拉起本地后端（${repoDir}）…`);
    spawnDetached('uv', ['run', 'python', 'backend/main.py'], repoDir);
    const ok = await waitForVoiceStudio(url, waitSeconds);
    if (ok) {
      console.log(`${tag} 已就绪`);
      ensureOmniVoiceModel(url);
    } else {
      console.warn(`${tag} 等待 ${waitSeconds}s 仍未就绪（首次启动需加载 torch/模型，可调大 VOICESTUDIO_WAIT_SECONDS）`);
    }
    return ok;
  }

  // 3. 未安装：自动安装（装完自动拉起）或提示
  if (process.env.VOICESTUDIO_AUTO_SETUP !== '0') {
    runAutoSetup(
      () => {
        // 装完 → 拉起 → 轮询（后台继续）
        (async () => {
          console.log(`${tag} 安装完成，正在拉起本地后端…`);
          spawnDetached('uv', ['run', 'python', 'backend/main.py'], repoDir);
          const ok = await waitForVoiceStudio(url, waitSeconds);
          if (ok) {
            console.log(`${tag} 已就绪`);
            ensureOmniVoiceModel(url);
          } else {
            console.warn(`${tag} 安装完成但服务未在 ${waitSeconds}s 内就绪`);
          }
        })();
      },
      (msg) => console.warn(`${tag} 自动安装失败（${msg}）。可手动运行 npm run setup:voicestudio 后重启后端`),
    );
    return false;
  }

  // 4. 兜底：桌面应用 exe
  const resolved = resolveVoiceStudioCommand();
  if (resolved) {
    console.log(`${tag} 未运行，正在启动桌面应用: ${resolved.command}`);
    spawnDetached(resolved.command, resolved.args, resolved.cwd);
    const ok = await waitForVoiceStudio(url, waitSeconds);
    if (ok) {
      console.log(`${tag} 已就绪`);
      ensureOmniVoiceModel(url);
    }
    return ok;
  }

  console.warn(`${tag} 未运行且未安装。已自动触发后台安装；也可手动 npm run setup:voicestudio`);
  return false;
}
