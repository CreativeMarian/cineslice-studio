// 适配器统一注册入口
// 加载顺序说明：适配器模块在顶层调用 registerXxxFactory，依赖 registry 中的工厂 Map 已初始化。
// 若在本文件静态 import 适配器会导致循环依赖 + TDZ 错误（旧实现因此使用 require）。
// 本入口先完整加载 registry，再按序加载各适配器，顺序由 import 语句显式保证。
// 服务启动时（server/src/index.ts）引入本模块即完成全部适配器注册。
// re-export registry API，业务方 `import { getXxxAdapter } from '../services/adapters'`
// 即可同时确保注册已完成。
export * from './registry';
import './registry';

// 文本适配器
import './text/openai';
import './text/anthropic';
import './text/google';
import './text/doubao';
import './text/qwen';
import './text/zhipu';
import './text/deepseek';
import './text/moonshot';
import './text/minimax';
import './text/xfyun';
import './text/siliconflow';
import './text/ollama';

// 图像适配器
import './image/openai-image';
import './image/stability';
import './image/qwen-image';
import './image/zhipu-image';
import './image/doubao-image';
import './image/ideogram';
import './image/recraft';
import './image/flux';
import './image/siliconflow-image';
import './image/wan-image';
import './image/custom-openai-image';

// 视频适配器
import './video/doubao-video';
import './video/kling-video';
import './video/jimeng-video';
import './video/hailuo-video';
import './video/minimax-video';
import './video/happyhorse-video';
import './video/agnes-video';
import './video/custom-openai-video';
import './video/comfyui';

// 音频适配器
import './audio/openai-audio';
import './audio/doubao-audio';
import './audio/edge-tts';
import './audio/minimax-audio';
import './audio/custom-openai-audio';
