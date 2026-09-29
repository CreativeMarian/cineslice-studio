// VoiceStudio 一键安装脚本（跨平台，Node 直接跑）
// 用法: npm run setup:voicestudio
// 做什么:
//   1. 若 vendor/voicestudio 不存在 → git clone VoiceStudio stable 源码（shallow + 子模块）
//   2. 打网络适配补丁（幂等）：收窄 Python 版本、移除 GitHub Releases 直链的可选引擎、
//      torch 改走 PyPI CPU 版（受限网络下 cu128 3.4GB 无法稳定下载）
//   3. uv sync 安装 Python 依赖（清华 PyPI 镜像加速）
//   4. 写就绪标记 vendor/voicestudio/.ready → 后端启动时据此自动拉起服务
// 前置要求: git、Python >= 3.11、uv（缺 uv 时自动尝试 pip install uv）
// 注意: 首次安装耗时较长（依赖安装 10-40 分钟），属正常现象

import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const vendorDir = path.join(projectRoot, 'vendor');
const repoDir = path.join(vendorDir, 'voicestudio');
const readyFile = path.join(repoDir, '.ready');

const REPO = 'https://github.com/debpalash/VoiceStudio.git';
// 默认拉取官方 stable 发布版：main 分支处于开发态，其 pyproject 可能引用未发布的依赖
// （如 litellm>=1.103 只有 rc），uv sync 会解析失败；发布版的依赖是验证过的。
// 可通过环境变量 VOICESTUDIO_VERSION 覆盖（如 main 或 v0.5.6）
const VERSION = process.env.VOICESTUDIO_VERSION || 'v0.5.6';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n>> ${cmd} ${args.join(' ')}${opts.cwd ? `  (cwd: ${opts.cwd})` : ''}`);
    const child = spawn(cmd, args, {
      cwd: opts.cwd || projectRoot,
      env: opts.env || process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32' && (cmd === 'git' || cmd === 'uv'),
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} 退出码 ${code}`));
    });
  });
}

async function ensureUv() {
  try {
    await run('uv', ['--version']);
    return;
  } catch {
    // uv 未安装 → 尝试 pip 安装
    console.log('未检测到 uv，尝试通过 pip 安装…');
    try {
      await run('pip', ['install', 'uv']);
      console.log('uv 安装完成');
    } catch (e) {
      throw new Error(`自动安装 uv 失败: ${e.message}\n请手动安装 uv（https://docs.astral.sh/uv/）后重试`);
    }
  }
}

// 网络适配补丁（幂等）：把上游在受限网络下无法安装的问题修掉。
// 这些补丁只针对「下载/解析」环节，不改变核心 OmniVoice 配音能力。
function applyNetworkPatches(dir) {
  const pp = path.join(dir, 'pyproject.toml');
  if (!fs.existsSync(pp)) return;
  let text = fs.readFileSync(pp, 'utf8');
  let changed = false;

  // 4a. 限制 Python 版本：上游 requires-python >=3.11 全开，uv 必须为所有支持
  //     版本（含 Python 3.14 win32）找到 wheel，而 torch 2.8.0 没有 cp314 wheel，
  //     导致整棵解析失败。实际运行用 uv 自动装的 3.11，收窄范围即可。
  if (text.includes('requires-python = ">=3.11"')) {
    text = text.replace('requires-python = ">=3.11"', 'requires-python = ">=3.11,<3.14"');
    changed = true;
    console.log('[补丁] requires-python 收窄为 3.11–3.13');
  }

  // 4b. 移除 KittenTTS：它的 wheel 只在 GitHub Releases（受限网络不可达），
  //     且是懒加载的可选引擎，核心 OmniVoice 不受影响。
  const kittenLine = text.split('\n').findIndex((l) => l.includes('kittentts @ https://'));
  if (kittenLine >= 0) {
    const lines = text.split('\n');
    lines.splice(kittenLine, 1);
    text = lines.join('\n');
    changed = true;
    console.log('[补丁] 移除 KittenTTS GitHub Releases 依赖（可选引擎，不影响 OmniVoice）');
  }

  // 4c. torch 改走 PyPI CPU 版：上游强制 +cu128（约 3.4GB），在受限网络上
  //     无法稳定下载；CPU 版 torch 约 190MB，走国内 PyPI 镜像秒下。
  //     OmniVoice TTS 为离线批量推理，CPU 完全够用；要 GPU 加速再手动补装。
  const hasIndexBlock = text.includes('[[tool.uv.index]]') && text.includes('name = "pytorch-cuda"');
  const hasSourcesBlock = text.includes('[tool.uv.sources]') && text.includes('index = "pytorch-cuda"');
  if (hasIndexBlock || hasSourcesBlock) {
    // 删 [[tool.uv.index]] 块（name/url/explicit 注释块）
    text = text.replace(/\[\[tool\.uv\.index\]\]\nname = "pytorch-cuda"\n[\s\S]*?\n\n/g, '');
    // 删 [tool.uv.sources] 整块（torch/torchaudio/torchvision 三条）
    text = text.replace(/\[tool\.uv\.sources\][\s\S]*?\n\n/, '');
    changed = true;
    console.log('[补丁] torch 改走 PyPI CPU 版（移除 cu128 index/sources）');
  }

  if (changed) {
    fs.writeFileSync(pp, text);
  }
}

async function main() {
  console.log('===== VoiceStudio 一键安装 =====');

  // 1. Python 版本检查
  try {
    const pyVer = execFileSync('python', ['--version']).toString().trim();
    console.log(`Python: ${pyVer}`);
    const m = pyVer.match(/Python (\d+)\.(\d+)/);
    if (!m || Number(m[1]) < 3 || (Number(m[1]) === 3 && Number(m[2]) < 11)) {
      throw new Error('需要 Python >= 3.11');
    }
  } catch (e) {
    console.error(`Python 检查失败: ${e.message}`);
    process.exit(1);
  }

  // 2. uv
  try {
    await ensureUv();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  // 3. clone
  if (fs.existsSync(path.join(repoDir, 'backend', 'main.py'))) {
    console.log(`\n已存在源码: ${repoDir}，跳过 clone`);
  } else {
    fs.mkdirSync(vendorDir, { recursive: true });
    console.log(`\n克隆 VoiceStudio ${VERSION}（含子模块，首次需几分钟）…`);
    await run('git', [
      'clone', '--depth', '1', '--branch', VERSION,
      '--recurse-submodules', '--shallow-submodules',
      REPO, repoDir,
    ]);
  }

  // 4. 网络适配补丁
  applyNetworkPatches(repoDir);

  // 5. uv sync 安装依赖（国内网络用清华 PyPI 镜像加速）
  console.log('\n安装 Python 依赖（uv sync，首次约 5-7GB、10-40 分钟）…');
  await run('uv', ['sync'], {
    cwd: repoDir,
    env: { ...process.env, UV_DEFAULT_INDEX: process.env.UV_DEFAULT_INDEX || 'https://pypi.tuna.tsinghua.edu.cn/simple' },
  });

  // 6. 就绪标记
  fs.writeFileSync(readyFile, new Date().toISOString());
  console.log(`\n✅ VoiceStudio 安装完成（标记: ${readyFile}）`);
  console.log('后端下次启动时将自动拉起语音服务；首次生成配音会自动下载 OmniVoice 模型（约 2.4GB）');
}

main().catch((e) => {
  console.error(`\n❌ 安装失败: ${e.message}`);
  process.exit(1);
});
