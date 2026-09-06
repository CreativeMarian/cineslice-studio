// ============================================================
// 模型与提供商类型、内置模型列表
// 全量扩充：文本 23 + 图像 14 + 视频 14 + 音频 8 = 59 个模型
// ============================================================

import type { ModelType } from '../types';

export interface ModelMeta {
  provider: string;
  providerName: string;
  modelName: string;
  displayName: string;
  modelType: ModelType;
  description: string;
  scenarios?: string[];
  signupUrl?: string;
  supports: {
    jsonOutput?: boolean;
    referenceImage?: boolean;
    customEndpoint?: boolean;
    audio?: boolean;
  };
  costEstimate?: {
    per1kTokens?: number;
    perImage?: number;
    perVideo?: number;
    perSecond?: number;
  };
  defaultVoice?: string;
  /** 是否需要接入点ID（如火山方舟的ep-xxx） */
  requiresEndpointId?: boolean;
  /** 是否需要AppID（如豆包TTS） */
  requiresAppId?: boolean;
  /** 配置提示文本，指导用户如何配置 */
  configHint?: string;
  /** 官方文档链接 */
  docsUrl?: string;
}

// ---------- 文本模型（19个） ----------

const TEXT_MODELS: ModelMeta[] = [
  // 豆包（火山方舟最新模型）
  {
    provider: 'doubao', providerName: '字节豆包',
    modelName: 'doubao-seed-evolving', displayName: '豆包 Seed Evolving',
    modelType: 'text', description: '快速迭代模型，1M超长上下文，Coding与Agent能力强，周级迭代持续进化',
    scenarios: ['代码生成', '复杂推理', '长文本分析', 'Agent任务'],
    supports: { jsonOutput: true, customEndpoint: true, referenceImage: true },
    costEstimate: { per1kTokens: 0.004 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '字节豆包',
    modelName: 'doubao-seed-2-1-pro-260628', displayName: '豆包 Seed 2.1 Pro',
    modelType: 'text', description: '深度思考模型，256K上下文，多模态理解，剧本创作与复杂推理强',
    scenarios: ['剧本创作', '复杂推理', '多模态理解', '深度分析'],
    supports: { jsonOutput: true, customEndpoint: true, referenceImage: true },
    costEstimate: { per1kTokens: 0.003 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '字节豆包',
    modelName: 'doubao-seed-2-1-turbo-260628', displayName: '豆包 Seed 2.1 Turbo',
    modelType: 'text', description: '深度思考模型，256K上下文，性价比高，适合批量生成',
    scenarios: ['批量生成', '内容润色', '高性价比', '多模态理解'],
    supports: { jsonOutput: true, customEndpoint: true, referenceImage: true },
    costEstimate: { per1kTokens: 0.0015 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '字节豆包',
    modelName: 'doubao-seed-character-260628', displayName: '豆包 Seed Character',
    modelType: 'text', description: '角色对话专用模型，角色扮演能力突出，适合角色对话生成',
    scenarios: ['角色扮演', '剧本对话', '角色塑造'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.001 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  // 豆包（往期模型，即将下线）
  {
    provider: 'doubao', providerName: '字节豆包',
    modelName: 'doubao-seed-1-6', displayName: '豆包 Seed 1.6（即将下线）',
    modelType: 'text', description: '豆包推理模型，256K上下文，剧本创作与复杂推理强',
    scenarios: ['剧本创作', '复杂推理', '多模态理解'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0016 },
  },
  {
    provider: 'doubao', providerName: '字节豆包',
    modelName: 'doubao-1-5-pro-32k', displayName: '豆包 1.5 Pro 32K（即将下线）',
    modelType: 'text', description: '豆包专业版，32K上下文，综合能力强',
    scenarios: ['剧本创作', '内容生成', '通用对话'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0008 },
  },
  // DeepSeek
  {
    provider: 'deepseek', providerName: 'DeepSeek',
    modelName: 'deepseek-chat', displayName: 'DeepSeek Chat',
    modelType: 'text', description: 'DeepSeek 对话模型，推理能力强，性价比高',
    scenarios: ['通用对话', '内容生成', '高性价比'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.00028 },
  },
  {
    provider: 'deepseek', providerName: 'DeepSeek',
    modelName: 'deepseek-reasoner', displayName: 'DeepSeek R1',
    modelType: 'text', description: 'DeepSeek 推理模型，复杂逻辑与剧本结构分析优异',
    scenarios: ['复杂推理', '剧本结构', '深度分析'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0014 },
  },
  // 通义千问
  {
    provider: 'qwen', providerName: '阿里通义千问',
    modelName: 'qwen-max', displayName: '通义千问 Max',
    modelType: 'text', description: '阿里旗舰模型，中文理解与生成优秀',
    scenarios: ['剧本创作', '复杂推理', '内容生成'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0012 },
  },
  {
    provider: 'qwen', providerName: '阿里通义千问',
    modelName: 'qwen-plus', displayName: '通义千问 Plus',
    modelType: 'text', description: '阿里平衡型模型，性能与成本兼顾',
    scenarios: ['通用对话', '内容生成', '快速响应'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0008 },
  },
  {
    provider: 'qwen', providerName: '阿里通义千问',
    modelName: 'qwen-turbo', displayName: '通义千问 Turbo',
    modelType: 'text', description: '阿里快速模型，延迟低适合实时交互',
    scenarios: ['高并发', '低成本', '快速响应'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0003 },
  },
  // 智谱
  {
    provider: 'zhipu', providerName: '智谱 GLM',
    modelName: 'glm-4-plus', displayName: 'GLM-4 Plus',
    modelType: 'text', description: '智谱增强版模型，长文本与推理能力提升',
    scenarios: ['长文本分析', '剧本创作', '复杂推理'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0015 },
  },
  {
    provider: 'zhipu', providerName: '智谱 GLM',
    modelName: 'glm-4-flash', displayName: 'GLM-4 Flash',
    modelType: 'text', description: '智谱免费快速模型，速度极快',
    scenarios: ['高并发', '低成本', '快速响应'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0001 },
  },
  // 月之暗面
  {
    provider: 'moonshot', providerName: '月之暗面 Kimi',
    modelName: 'moonshot-v1-128k', displayName: 'Kimi 128K',
    modelType: 'text', description: '月之暗面超长上下文模型，支持128K',
    scenarios: ['长文本分析', '全书摘要', '大规模文本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0048 },
  },
  {
    provider: 'moonshot', providerName: '月之暗面 Kimi',
    modelName: 'moonshot-v1-32k', displayName: 'Kimi 32K',
    modelType: 'text', description: '月之暗面长上下文模型，支持32K',
    scenarios: ['长文本分析', '剧本创作', '内容摘要'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0024 },
  },
  // 讯飞
  {
    provider: 'xfyun', providerName: '讯飞星火',
    modelName: 'spark-v4.0', displayName: '讯飞星火 V4.0',
    modelType: 'text', description: '讯飞星火4.0版本，最新旗舰',
    scenarios: ['通用对话', '内容生成', '教育医疗'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0015 },
  },
  {
    provider: 'xfyun', providerName: '讯飞星火',
    modelName: 'spark-v3.5', displayName: '讯飞星火 V3.5',
    modelType: 'text', description: '讯飞星火3.5版本，通用能力强',
    scenarios: ['通用对话', '内容生成', '快速响应'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.001 },
  },
  // OpenAI
  {
    provider: 'openai', providerName: 'OpenAI',
    modelName: 'gpt-4o', displayName: 'GPT-4o',
    modelType: 'text', description: 'OpenAI 旗舰多模态模型，强推理与代码能力',
    scenarios: ['剧本创作', '复杂推理', '多模态理解'],
    supports: { jsonOutput: true, referenceImage: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.005 },
  },
  {
    provider: 'openai', providerName: 'OpenAI',
    modelName: 'gpt-4o-mini', displayName: 'GPT-4o Mini',
    modelType: 'text', description: 'OpenAI 轻量快速模型，成本仅为 GPT-4o 的 1/10',
    scenarios: ['高并发', '低成本', '快速响应'],
    supports: { jsonOutput: true, referenceImage: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.00015 },
  },
  // Anthropic
  {
    provider: 'anthropic', providerName: 'Anthropic',
    modelName: 'claude-3-5-sonnet', displayName: 'Claude 3.5 Sonnet',
    modelType: 'text', description: 'Anthropic 高性能模型，长文本与分析出色',
    scenarios: ['长文本分析', '剧本创作', '复杂推理'],
    supports: { jsonOutput: true, referenceImage: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.003 },
  },
  // Google
  {
    provider: 'google', providerName: 'Google Gemini',
    modelName: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro',
    modelType: 'text', description: 'Google 长上下文模型，支持 1M token',
    scenarios: ['长文本分析', '多模态理解', '复杂推理'],
    supports: { jsonOutput: true, referenceImage: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0025 },
  },
  // 硅基流动
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'meta-llama/Meta-Llama-3.1-405B-Instruct', displayName: 'Llama 3.1 405B (硅基流动)',
    modelType: 'text', description: 'Meta Llama 3.1 405B 旗舰模型，硅基流动托管',
    scenarios: ['复杂推理', '长文本分析', '多语言'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.002 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 硅基流动 - Qwen系列
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'Qwen/Qwen2.5-72B-Instruct', displayName: 'Qwen2.5 72B (硅基流动)',
    modelType: 'text', description: '通义千问2.5 72B指令模型，中文理解优秀，硅基流动托管',
    scenarios: ['剧本创作', '中文理解', '长文本分析'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0008 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'Qwen/Qwen2.5-32B-Instruct', displayName: 'Qwen2.5 32B (硅基流动)',
    modelType: 'text', description: '通义千问2.5 32B指令模型，性价比高，硅基流动托管',
    scenarios: ['内容生成', '批量处理', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0004 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'Qwen/Qwen2.5-14B-Instruct', displayName: 'Qwen2.5 14B (硅基流动)',
    modelType: 'text', description: '通义千问2.5 14B指令模型，速度快成本低，硅基流动托管',
    scenarios: ['高并发', '实时交互', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0002 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 硅基流动 - DeepSeek系列
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'deepseek-ai/DeepSeek-V3', displayName: 'DeepSeek V3 (硅基流动)',
    modelType: 'text', description: 'DeepSeek V3 旗舰模型，推理能力强，硅基流动托管',
    scenarios: ['复杂推理', '剧本创作', '代码生成'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.001 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'deepseek-ai/DeepSeek-R1', displayName: 'DeepSeek R1 (硅基流动)',
    modelType: 'text', description: 'DeepSeek R1 推理模型，复杂逻辑与剧本结构分析优异，硅基流动托管',
    scenarios: ['复杂推理', '剧本逻辑', '深度分析'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0014 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 硅基流动 - GLM系列
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'THUDM/glm-4-9b-chat', displayName: 'GLM-4 9B (硅基流动)',
    modelType: 'text', description: '智谱GLM-4 9B对话模型，中文理解好，硅基流动托管',
    scenarios: ['内容生成', '中文对话', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0001 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 硅基流动 - Mistral系列
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'mistralai/Mistral-Nemo-Instruct-2407', displayName: 'Mistral Nemo (硅基流动)',
    modelType: 'text', description: 'Mistral Nemo 12B模型，多语言能力强，硅基流动托管',
    scenarios: ['多语言', '内容生成', '长文本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0003 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 硅基流动 - 免费模型
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'Qwen/Qwen2.5-7B-Instruct', displayName: 'Qwen2.5 7B 免费 (硅基流动)',
    modelType: 'text', description: '通义千问2.5 7B指令模型，免费使用，硅基流动托管',
    scenarios: ['免费测试', '快速原型', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取。此模型免费！',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 更多文本模型
  {
    provider: 'doubao', providerName: '字节豆包',
    modelName: 'doubao-seed-1-6-flash', displayName: '豆包 Seed 1.6 Flash',
    modelType: 'text', description: '豆包轻量高速版，延迟极低，适合批量生成和实时交互',
    scenarios: ['高并发', '批量生成', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0001 },
    requiresEndpointId: true,
    configHint: '需要在火山方舟控制台创建文本模型接入点，获取ep-xxx ID',
    docsUrl: 'https://console.volcengine.com/ark',
  },
  {
    provider: 'zhipu', providerName: '智谱AI',
    modelName: 'glm-4-air', displayName: 'GLM-4 Air',
    modelType: 'text', description: '智谱轻量版模型，速度快成本低，适合日常使用',
    scenarios: ['内容生成', '高并发', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0001 },
    docsUrl: 'https://open.bigmodel.cn/',
  },
  {
    provider: 'zhipu', providerName: '智谱AI',
    modelName: 'glm-4-long', displayName: 'GLM-4 Long',
    modelType: 'text', description: '智谱超长上下文模型，支持1M token，适合长文本分析',
    scenarios: ['长文本分析', '剧本分析', '多文档理解'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.001 },
    docsUrl: 'https://open.bigmodel.cn/',
  },
  {
    provider: 'moonshot', providerName: '月之暗面',
    modelName: 'moonshot-v1-8k', displayName: 'Kimi 8K',
    modelType: 'text', description: '月之暗面Kimi模型，8K上下文，适合短文本快速生成',
    scenarios: ['内容生成', '快速对话', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0012 },
    docsUrl: 'https://platform.moonshot.cn/',
  },
  // MiniMax - 最新模型
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'MiniMax-M3', displayName: 'MiniMax M3',
    modelType: 'text', description: '原生多模态、1M上下文的Frontier Coding模型，代码能力极强',
    scenarios: ['代码生成', '复杂推理', '长文本分析', '多模态理解'],
    supports: { jsonOutput: true, customEndpoint: true, referenceImage: true },
    costEstimate: { per1kTokens: 0.003 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'MiniMax-M2.7', displayName: 'MiniMax M2.7',
    modelType: 'text', description: '开启模型自我迭代，综合能力强，适合剧本创作和复杂推理',
    scenarios: ['剧本创作', '复杂推理', '内容生成', '多轮对话'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.002 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'MiniMax-M2.7-highspeed', displayName: 'MiniMax M2.7 高速版',
    modelType: 'text', description: '与M2.7效果不变，速度大幅提升，适合批量生成和实时交互',
    scenarios: ['批量生成', '实时对话', '内容润色', '高并发'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0015 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'MiniMax-M2.5', displayName: 'MiniMax M2.5',
    modelType: 'text', description: '顶尖性能与极致性价比，轻松驾驭复杂任务，性价比高',
    scenarios: ['复杂推理', '剧本创作', '内容生成', '高性价比'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.001 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'abab6.5s-chat', displayName: 'MiniMax abab6.5s',
    modelType: 'text', description: 'MiniMax对话模型，角色扮演能力突出，适合角色对话生成',
    scenarios: ['角色扮演', '剧本对话', '内容生成'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0003 },
    docsUrl: 'https://www.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'abab6.5-chat', displayName: 'MiniMax abab6.5',
    modelType: 'text', description: 'MiniMax通用对话模型，综合能力强，适合剧本创作和内容生成',
    scenarios: ['剧本创作', '内容生成', '通用对话'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0005 },
    docsUrl: 'https://www.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'abab5.5-chat', displayName: 'MiniMax abab5.5',
    modelType: 'text', description: 'MiniMax轻量对话模型，速度快成本低，适合批量生成',
    scenarios: ['批量生成', '内容润色', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0001 },
    docsUrl: 'https://www.minimaxi.com/',
  },
  // ========== 开源文本模型（通过硅基流动/Ollama） ==========
  // Llama 系列（Meta开源）
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'meta-llama/Meta-Llama-3.1-8B-Instruct', displayName: 'Llama 3.1 8B (开源)',
    modelType: 'text', description: 'Meta Llama 3.1 8B开源指令模型，轻量高效，硅基流动托管',
    scenarios: ['内容生成', '快速对话', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0001 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'meta-llama/Meta-Llama-3.1-70B-Instruct', displayName: 'Llama 3.1 70B (开源)',
    modelType: 'text', description: 'Meta Llama 3.1 70B开源旗舰模型，推理能力强，硅基流动托管',
    scenarios: ['复杂推理', '剧本创作', '长文本分析'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0008 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // Mistral 系列（开源）
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'mistralai/Mistral-7B-Instruct-v0.3', displayName: 'Mistral 7B v0.3 (开源)',
    modelType: 'text', description: 'Mistral 7B开源指令模型，欧洲开源旗舰，效率高，硅基流动托管',
    scenarios: ['内容生成', '多语言', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0001 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'mistralai/Mixtral-8x7B-Instruct-v0.1', displayName: 'Mixtral 8x7B (开源)',
    modelType: 'text', description: 'Mixtral 8x7B MoE开源模型，专家混合架构，性能接近70B，硅基流动托管',
    scenarios: ['复杂推理', '内容生成', '高性价比'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0003 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // Gemma 系列（Google开源）
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'google/gemma-2-9b-it', displayName: 'Gemma 2 9B (开源)',
    modelType: 'text', description: 'Google Gemma 2 9B开源指令模型，轻量高效，硅基流动托管',
    scenarios: ['内容生成', '快速对话', '低成本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0001 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'google/gemma-2-27b-it', displayName: 'Gemma 2 27B (开源)',
    modelType: 'text', description: 'Google Gemma 2 27B开源旗舰模型，推理能力强，硅基流动托管',
    scenarios: ['复杂推理', '剧本创作', '长文本'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0005 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // Phi 系列（微软开源）
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'microsoft/Phi-3-medium-128k-instruct', displayName: 'Phi-3 Medium 128K (开源)',
    modelType: 'text', description: '微软Phi-3 Medium开源模型，128K超长上下文，小模型大能力，硅基流动托管',
    scenarios: ['长文本分析', '内容生成', '高性价比'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0.0002 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // Ollama 本地部署（完全免费）
  {
    provider: 'ollama', providerName: 'Ollama (本地免费)',
    modelName: 'llama3.1', displayName: 'Ollama Llama 3.1 (本地免费)',
    modelType: 'text', description: '通过Ollama本地部署开源模型，完全免费无需API Key，支持Llama/Qwen/Mistral等',
    scenarios: ['免费测试', '本地部署', '隐私保护'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0 },
    configHint: '完全免费！需本地安装Ollama并拉取模型。默认Endpoint: http://localhost:11434/v1',
    docsUrl: 'https://ollama.com/',
  },
  {
    provider: 'ollama', providerName: 'Ollama (本地免费)',
    modelName: 'qwen2.5', displayName: 'Ollama Qwen 2.5 (本地免费)',
    modelType: 'text', description: '通过Ollama本地部署通义千问2.5开源模型，中文理解优秀，完全免费',
    scenarios: ['免费测试', '中文创作', '本地部署'],
    supports: { jsonOutput: true, customEndpoint: true },
    costEstimate: { per1kTokens: 0 },
    configHint: '完全免费！需本地安装Ollama并拉取模型。默认Endpoint: http://localhost:11434/v1',
    docsUrl: 'https://ollama.com/',
  },
];

// ---------- 图像模型（12个） ----------

const IMAGE_MODELS: ModelMeta[] = [
  // 豆包（火山方舟最新图像模型）
  {
    provider: 'doubao', providerName: '字节豆包图片',
    modelName: 'doubao-seedream-5-0-pro-260628', displayName: '豆包 Seedream 5.0 Pro',
    modelType: 'image', description: '最新图像创作模型，精准图像编辑，解锁图层自由，支持文生图/图生图/多参考图',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.02 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '字节豆包图片',
    modelName: 'doubao-seedream-5-0-260128', displayName: '豆包 Seedream 5.0',
    modelType: 'image', description: '图像生成模型，支持单图生成和组图生成，文生图/图生图/多参考图',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.015 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '字节豆包图片',
    modelName: 'doubao-seedream-4-5-251128', displayName: '豆包 Seedream 4.5',
    modelType: 'image', description: '图像生成模型，画质精细风格多样，支持单图生成和组图生成',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.012 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  // MiniMax 图片模型
  {
    provider: 'minimax-image', providerName: 'MiniMax 图片',
    modelName: 'image-01', displayName: 'MiniMax image-01',
    modelType: 'image', description: 'MiniMax图像生成模型，画面表现细腻，支持文生图、图生图',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.015 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax-image', providerName: 'MiniMax 图片',
    modelName: 'image-01-live', displayName: 'MiniMax image-01-live',
    modelType: 'image', description: 'MiniMax图像生成模型，手绘、卡通等画风增强，支持文生图并进行画风设置',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.015 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  // 通义万相
  {
    provider: 'qwen-image', providerName: '阿里通义万相',
    modelName: 'wanx-v1', displayName: '通义万相 V1',
    modelType: 'image', description: '阿里巴巴文生图模型，中文场景理解好',
    supports: { customEndpoint: true },
    costEstimate: { perImage: 0.015 },
  },
  {
    provider: 'qwen-image', providerName: '阿里通义万相',
    modelName: 'wanx2.1-t2i', displayName: '通义万相 2.1',
    modelType: 'image', description: '阿里最新文生图模型，画质与提示词理解提升',
    supports: { customEndpoint: true },
    costEstimate: { perImage: 0.02 },
  },
  // 智谱
  {
    provider: 'zhipu-image', providerName: '智谱 CogView',
    modelName: 'cogview-3', displayName: 'CogView 3',
    modelType: 'image', description: '智谱 AI 文生图模型，画质精细',
    supports: { customEndpoint: true },
    costEstimate: { perImage: 0.02 },
  },
  {
    provider: 'zhipu-image', providerName: '智谱 CogView',
    modelName: 'cogview-4', displayName: 'CogView 4',
    modelType: 'image', description: '智谱最新图像生成模型，细节丰富',
    supports: { customEndpoint: true },
    costEstimate: { perImage: 0.025 },
  },
  // Stability
  {
    provider: 'stability', providerName: 'Stability AI',
    modelName: 'stable-diffusion-xl', displayName: 'Stable Diffusion XL',
    modelType: 'image', description: 'Stability AI 开源图像模型，可本地部署',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.02 },
  },
  {
    provider: 'stability', providerName: 'Stability AI',
    modelName: 'stable-diffusion-3', displayName: 'Stable Diffusion 3',
    modelType: 'image', description: 'Stability AI 最新图像模型，文字渲染能力强',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.03 },
  },
  // OpenAI
  {
    provider: 'openai-image', providerName: 'OpenAI',
    modelName: 'dall-e-3', displayName: 'DALL·E 3',
    modelType: 'image', description: 'OpenAI 文生图模型，提示词理解能力强',
    supports: { customEndpoint: true },
    costEstimate: { perImage: 0.04 },
  },
  // Ideogram
  {
    provider: 'ideogram', providerName: 'Ideogram',
    modelName: 'ideogram-v2', displayName: 'Ideogram V2',
    modelType: 'image', description: 'Ideogram 图像模型，文字渲染能力强',
    supports: { customEndpoint: true },
    costEstimate: { perImage: 0.03 },
  },
  // Recraft
  {
    provider: 'recraft', providerName: 'Recraft',
    modelName: 'recraft-v3', displayName: 'Recraft V3',
    modelType: 'image', description: 'Recraft 矢量风格图像模型，适合插画',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.02 },
  },
  // FLUX
  {
    provider: 'flux', providerName: 'Black Forest FLUX',
    modelName: 'flux-1.1-pro', displayName: 'FLUX 1.1 Pro',
    modelType: 'image', description: 'Black Forest Labs 旗舰图像模型，写实能力强',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.04 },
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'Kwai-Kolors/Kolors', displayName: 'Kolors (硅基流动)',
    modelType: 'image', description: '快手 Kolors 图像生成模型，硅基流动托管，中文理解好',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.008 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 硅基流动 - 更多图像模型
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'black-forest-labs/FLUX.1-dev', displayName: 'FLUX.1 Dev (硅基流动)',
    modelType: 'image', description: 'FLUX.1 Dev 开发版图像生成，硅基流动托管，画质精细',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.012 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'stabilityai/stable-diffusion-3-5-large', displayName: 'SD 3.5 Large (硅基流动)',
    modelType: 'image', description: 'Stable Diffusion 3.5 大模型，硅基流动托管，文字渲染能力强',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.015 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'ZJ-96/AnimeFlux', displayName: 'AnimeFlux (硅基流动)',
    modelType: 'image', description: 'AnimeFlux 动漫风格图像生成，硅基流动托管，动漫质量高',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.008 },
    configHint: '硅基流动使用统一API Key，在 https://cloud.siliconflow.cn/account/ak 获取。适合动漫风格！',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // ========== 更多开源图像模型 ==========
  // Stable Diffusion 系列（开源）
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'stabilityai/stable-diffusion-xl-base-1.0', displayName: 'SDXL 1.0 (开源)',
    modelType: 'image', description: 'Stable Diffusion XL 1.0开源图像模型，生态丰富，LoRA支持多，硅基流动托管',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.004 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'stabilityai/sdxl-turbo', displayName: 'SDXL Turbo (开源快速)',
    modelType: 'image', description: 'SDXL Turbo开源快速图像模型，1-4步即可出图，速度极快，硅基流动托管',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.002 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低，速度极快',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'stabilityai/stable-diffusion-2-1', displayName: 'SD 2.1 (开源)',
    modelType: 'image', description: 'Stable Diffusion 2.1开源图像模型，经典稳定，生态最丰富，硅基流动托管',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.002 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // FLUX 系列（开源）
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'black-forest-labs/FLUX.1-schnell', displayName: 'FLUX.1 Schnell (开源快速)',
    modelType: 'image', description: 'FLUX.1 Schnell开源快速图像模型，4步出图，画质优秀，硅基流动托管',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.004 },
    configHint: '硅基流动使用统一API Key，开源模型成本极低，速度快',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 动漫风格开源模型
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'cagliostrolab/animagine-xl-3.1', displayName: 'Animagine XL 3.1 (动漫开源)',
    modelType: 'image', description: 'Animagine XL 3.1开源动漫风格模型，日系动漫质量高，硅基流动托管',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.004 },
    configHint: '硅基流动使用统一API Key，专为动漫风格优化',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'stabilityai/japanese-stable-diffusion-xl', displayName: '日系 SDXL (动漫开源)',
    modelType: 'image', description: '日系Stable Diffusion XL开源模型，动漫风格优秀，硅基流动托管',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.004 },
    configHint: '硅基流动使用统一API Key，日系动漫风格',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
  // 国风开源模型
  {
    provider: 'siliconflow', providerName: '硅基流动',
    modelName: 'wtlkwq/chinese-style-xl', displayName: '国风 SDXL (开源)',
    modelType: 'image', description: '中国风Stable Diffusion XL开源模型，国风水墨/工笔风格，硅基流动托管',
    supports: { referenceImage: true, customEndpoint: true },
    costEstimate: { perImage: 0.004 },
    configHint: '硅基流动使用统一API Key，中国风风格',
    docsUrl: 'https://docs.siliconflow.cn/',
  },
];

// ---------- 视频模型（14个） ----------

const VIDEO_MODELS: ModelMeta[] = [
  // 豆包（火山方舟最新视频模型）
  {
    provider: 'doubao', providerName: '字节豆包视频',
    modelName: 'doubao-seedance-2-5-260628', displayName: '豆包 Seedance 2.5',
    modelType: 'video', description: '豆包最强视频生成模型，30秒超长叙事，全模态参考扩容，电影级画质，支持视频自带音频',
    supports: { referenceImage: true, customEndpoint: true, audio: true },
    costEstimate: { perVideo: 0.2 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '字节豆包视频',
    modelName: 'doubao-seedance-2-0-260128', displayName: '豆包 Seedance 2.0',
    modelType: 'video', description: '视频生成模型，15秒时长，全模态参考，画质精细，支持图生视频/参考视频/参考音频',
    supports: { referenceImage: true, customEndpoint: true, audio: true },
    costEstimate: { perVideo: 0.12 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '字节豆包视频',
    modelName: 'doubao-seedance-1-5-pro-251215', displayName: '豆包 Seedance 1.5 Pro',
    modelType: 'video', description: '视频生成模型，稳定可靠，性价比高，支持图生视频',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.08 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '字节豆包视频',
    modelName: 'doubao-seedance-1-0-pro-fast-251015', displayName: '豆包 Seedance Pro Fast 251015',
    modelType: 'video', description: '字节火山引擎最新视频生成模型，高速版，图生视频，支持1080p，支持音频',
    supports: { referenceImage: true, customEndpoint: true, audio: true },
    costEstimate: { perVideo: 0.15 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  // 可灵
  {
    provider: 'kling', providerName: '可灵 Kling',
    modelName: 'kling-v1-5', displayName: '可灵 1.5',
    modelType: 'video', description: '快手可灵视频模型，中文场景理解强',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.08 },
  },
  {
    provider: 'kling', providerName: '可灵 Kling',
    modelName: 'kling-v1-6', displayName: '可灵 1.6',
    modelType: 'video', description: '快手可灵最新视频模型，运动一致性提升',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.1 },
  },
  // 即梦
  {
    provider: 'jimeng', providerName: '即梦 Jimeng',
    modelName: 'jimeng-v2', displayName: '即梦 V2',
    modelType: 'video', description: '字节即梦最新视频生成模型',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.1 },
  },
  {
    provider: 'jimeng', providerName: '即梦 Jimeng',
    modelName: 'jimeng-v1', displayName: '即梦 V1',
    modelType: 'video', description: '字节即梦视频生成模型',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.08 },
  },
  // 海螺
  {
    provider: 'hailuo', providerName: '海螺 Hailuo',
    modelName: 'hailuo-v1', displayName: '海螺 V1',
    modelType: 'video', description: 'Hailuo AI 视频生成模型',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.07 },
  },
  {
    provider: 'hailuo', providerName: '海螺 Hailuo',
    modelName: 'hailuo-v2', displayName: '海螺 V2',
    modelType: 'video', description: 'Hailuo AI 最新视频生成模型，画质提升',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.09 },
  },
  // MiniMax 视频模型
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'MiniMax-H3', displayName: 'MiniMax H3',
    modelType: 'video', description: '新一代开放通用多模态视频模型，支持文生/图生/首尾帧/多模态参考，768P/2K分辨率，4-15s时长',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.08 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'MiniMax-Hailuo-2.3', displayName: 'MiniMax Hailuo 2.3',
    modelType: 'video', description: '全新视频生成模型，肢体动作、面部表情、物理表现与指令遵循再度突破',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.07 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'MiniMax-Hailuo-2.3-Fast', displayName: 'MiniMax Hailuo 2.3 Fast',
    modelType: 'video', description: '全新图生视频模型，物理表现与指令遵循具佳，更快更优惠',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.05 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax',
    modelName: 'MiniMax-Hailuo-02', displayName: 'MiniMax Hailuo 02',
    modelType: 'video', description: '新一代视频生成模型，1080p原生，SOTA指令遵循，极致物理表现',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.06 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  // Runway
  {
    provider: 'runway', providerName: 'Runway',
    modelName: 'runway-gen3-alpha', displayName: 'Runway Gen3 Alpha',
    modelType: 'video', description: 'Runway 旗舰视频生成模型，电影级画质',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.2 },
  },
  {
    provider: 'runway', providerName: 'Runway',
    modelName: 'runway-gen3-turbo', displayName: 'Runway Gen3 Turbo',
    modelType: 'video', description: 'Runway 高速视频生成模型',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.15 },
  },
  // Pika
  {
    provider: 'pika', providerName: 'Pika',
    modelName: 'pika-2.0', displayName: 'Pika 2.0',
    modelType: 'video', description: 'Pika Labs 视频模型，角色一致性好',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.12 },
  },
  {
    provider: 'pika', providerName: 'Pika',
    modelName: 'pika-1.0', displayName: 'Pika 1.0',
    modelType: 'video', description: 'Pika Labs 经典视频生成模型',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.1 },
  },
  // 更多视频模型
  {
    provider: 'doubao', providerName: '字节豆包视频',
    modelName: 'doubao-seedance-1-0-pro', displayName: '豆包 Seedance 1.0 Pro',
    modelType: 'video', description: '字节火山引擎视频生成模型，高画质，稳定可靠',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.15 },
    requiresEndpointId: true,
    configHint: '需要在火山方舟控制台创建视频模型接入点，获取ep-xxx ID',
    docsUrl: 'https://console.volcengine.com/ark',
  },
  {
    provider: 'doubao', providerName: '字节豆包视频',
    modelName: 'doubao-seedance-1-0-lite', displayName: '豆包 Seedance 1.0 Lite',
    modelType: 'video', description: '字节火山引擎轻量视频生成，速度快成本低',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.08 },
    requiresEndpointId: true,
    configHint: '需要在火山方舟控制台创建视频模型接入点，获取ep-xxx ID',
    docsUrl: 'https://console.volcengine.com/ark',
  },
  {
    provider: 'kling', providerName: '可灵',
    modelName: 'kling-v2', displayName: '可灵 2.0',
    modelType: 'video', description: '快手可灵最新视频模型，运动一致性与画质大幅提升',
    supports: { referenceImage: true, customEndpoint: true, audio: true },
    costEstimate: { perVideo: 0.12 },
    configHint: '可灵API支持视频自带音频生成',
    docsUrl: 'https://kling.kuaishou.com/',
  },
  {
    provider: 'jimeng', providerName: '即梦',
    modelName: 'jimeng-v3', displayName: '即梦 V3',
    modelType: 'video', description: '字节即梦最新视频生成模型，支持图生视频和文生视频',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0.12 },
    docsUrl: 'https://jimeng.jianying.com/',
  },
  // HappyHorse（通义千问 / DashScope）
  {
    provider: 'happyhorse', providerName: 'HappyHorse',
    modelName: 'happyhorse-1.1-i2v', displayName: 'HappyHorse 1.1 I2V',
    modelType: 'video', description: '阿里巴巴通义千问视频生成，人物ID保持、动作流畅、音画同步、文字渲染稳定',
    supports: { referenceImage: true, customEndpoint: true, audio: true },
    costEstimate: { perVideo: 0.27 },
    configHint: '使用DashScope API Key，支持图生视频和视频自带音频',
    docsUrl: 'https://www.qianwenai.com/models/happyhorse-1.1-i2v',
  },
  // Agnes AI
  {
    provider: 'agnes', providerName: 'Agnes AI',
    modelName: 'agnes-video-v2.0', displayName: 'Agnes Video V2.0',
    modelType: 'video', description: 'Agnes AI 视频生成，文生视频、图生视频、关键帧动画，电影级输出，异步任务API',
    supports: { referenceImage: true, customEndpoint: true, audio: false },
    costEstimate: { perVideo: 0 },
    configHint: '使用Agnes AI API Key，支持图生视频和关键帧动画，当前免费',
    docsUrl: 'https://wiki.agnes-ai.com/zh-Hans/docs/agnes-video-v20',
  },
];

// ---------- 音频模型（8个） ----------

const AUDIO_MODELS: ModelMeta[] = [
  // 豆包（火山方舟音频模型）
  {
    provider: 'doubao', providerName: '豆包语音',
    modelName: 'seed-audio-1-0', displayName: '豆包 Seed Audio 1.0',
    modelType: 'audio', description: '字节最新语音合成模型，自然流畅，支持多音色和情绪控制',
    supports: { customEndpoint: true },
    defaultVoice: 'zh_female_qingxin',
    costEstimate: { perSecond: 0.0003 },
    docsUrl: 'https://console.volcengine.com/ark/',
  },
  {
    provider: 'doubao', providerName: '豆包语音',
    modelName: 'doubao-tts', displayName: '豆包语音 TTS（经典版）',
    modelType: 'audio', description: '字节跳动经典语音合成，中文音色丰富，稳定可靠',
    supports: { customEndpoint: true },
    defaultVoice: 'zh_female_qingxin',
    costEstimate: { perSecond: 0.0002 },
  },
  // MiniMax 语音模型
  {
    provider: 'minimax', providerName: 'MiniMax 语音',
    modelName: 'speech-2.8-hd', displayName: 'MiniMax Speech 2.8 HD',
    modelType: 'audio', description: '新一代语音HD模型，情绪渲染融合语气词，重塑自然听感',
    supports: { customEndpoint: true },
    defaultVoice: 'female-shaonv',
    costEstimate: { perSecond: 0.0003 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax 语音',
    modelName: 'speech-2.8-turbo', displayName: 'MiniMax Speech 2.8 Turbo',
    modelType: 'audio', description: '新一代语音Turbo模型，极致生成速度，更自然逼真的音频效果',
    supports: { customEndpoint: true },
    defaultVoice: 'female-shaonv',
    costEstimate: { perSecond: 0.0002 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax 语音',
    modelName: 'speech-2.6-hd', displayName: 'MiniMax Speech 2.6 HD',
    modelType: 'audio', description: '极致音质与韵律表现，生成更快更自然',
    supports: { customEndpoint: true },
    defaultVoice: 'female-shaonv',
    costEstimate: { perSecond: 0.0002 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  {
    provider: 'minimax', providerName: 'MiniMax 语音',
    modelName: 'speech-2.6-turbo', displayName: 'MiniMax Speech 2.6 Turbo',
    modelType: 'audio', description: '音质优异，超低时延，响应更灵敏',
    supports: { customEndpoint: true },
    defaultVoice: 'female-shaonv',
    costEstimate: { perSecond: 0.00015 },
    docsUrl: 'https://platform.minimaxi.com/',
  },
  // OpenAI
  {
    provider: 'openai', providerName: 'OpenAI TTS',
    modelName: 'tts-1', displayName: 'OpenAI TTS',
    modelType: 'audio', description: 'OpenAI 语音合成，自然流畅',
    supports: { customEndpoint: true },
    defaultVoice: 'alloy',
    costEstimate: { perSecond: 0.00015 },
  },
  {
    provider: 'openai', providerName: 'OpenAI TTS',
    modelName: 'tts-1-hd', displayName: 'OpenAI TTS HD',
    modelType: 'audio', description: 'OpenAI 高清语音合成',
    supports: { customEndpoint: true },
    defaultVoice: 'alloy',
    costEstimate: { perSecond: 0.0003 },
  },
  // ElevenLabs
  {
    provider: 'elevenlabs', providerName: 'ElevenLabs',
    modelName: 'elevenlabs-v2', displayName: 'ElevenLabs V2',
    modelType: 'audio', description: 'ElevenLabs 语音合成，多语言音色自然',
    supports: { customEndpoint: true },
    defaultVoice: 'Rachel',
    costEstimate: { perSecond: 0.0003 },
  },
  {
    provider: 'elevenlabs', providerName: 'ElevenLabs',
    modelName: 'elevenlabs-multilingual', displayName: 'ElevenLabs Multilingual',
    modelType: 'audio', description: 'ElevenLabs 多语言语音合成',
    supports: { customEndpoint: true },
    defaultVoice: 'Rachel',
    costEstimate: { perSecond: 0.0003 },
  },
  // Azure
  {
    provider: 'azure', providerName: 'Azure TTS',
    modelName: 'azure-tts', displayName: 'Azure TTS',
    modelType: 'audio', description: '微软 Azure 语音合成，企业级稳定',
    supports: { customEndpoint: true },
    defaultVoice: 'zh-CN-XiaoxiaoNeural',
    costEstimate: { perSecond: 0.0002 },
  },
  // 讯飞
  {
    provider: 'xfyun', providerName: '讯飞语音',
    modelName: 'xfyun-tts', displayName: '讯飞语音 TTS',
    modelType: 'audio', description: '科大讯飞语音合成，中文发音标准',
    supports: { customEndpoint: true },
    defaultVoice: 'xiaoyan',
    costEstimate: { perSecond: 0.0002 },
  },
  // 通义
  {
    provider: 'qwen', providerName: '通义语音',
    modelName: 'qwen-tts', displayName: '通义语音 TTS',
    modelType: 'audio', description: '阿里巴巴语音合成模型',
    supports: { customEndpoint: true },
    defaultVoice: 'zh_female_qingxin',
    costEstimate: { perSecond: 0.0002 },
  },
  // ========== 开源/免费 TTS 模型 ==========
  // Edge TTS - 微软免费TTS
  {
    provider: 'edge-tts', providerName: 'Edge TTS (免费)',
    modelName: 'edge-tts-zh-CN-XiaoxiaoNeural', displayName: 'Edge TTS (免费开源)',
    modelType: 'audio', description: '微软Edge浏览器免费TTS，完全免费无需API Key，支持400+中英文音色，可在配置中切换音色',
    supports: { customEndpoint: false },
    defaultVoice: 'zh-CN-XiaoxiaoNeural',
    costEstimate: { perSecond: 0 },
    configHint: '完全免费！无需API Key。支持400+音色，在高级配置中设置 {"voice":"zh-CN-YunxiNeural"} 切换男声云希，或 {"voice":"zh-CN-XiaoyiNeural"} 切换活泼女声晓伊',
    docsUrl: 'https://github.com/rany2/edge-tts',
  },
  // ========== 开源 TTS 模型（需本地部署或第三方API） ==========
  // Bark - Suno开源生成式TTS，支持语气情感
  {
    provider: 'custom-openai', providerName: 'Bark (开源)',
    modelName: 'suno/bark', displayName: 'Bark 生成式TTS',
    modelType: 'audio', description: 'Suno开源生成式TTS，支持高度自然的语音合成，可生成音乐、音效和简单的语气情感，支持多语言',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署或使用HuggingFace/Replicate API。端点URL示例：http://localhost:5000/v1 或 https://api.openai.com/v1。支持语速调节(speed参数)和情感描述。部署：pip install bark',
    docsUrl: 'https://github.com/suno-ai/bark',
  },
  // XTTS v2 - Coqui多语言TTS，支持声音克隆
  {
    provider: 'custom-openai', providerName: 'XTTS v2 (开源)',
    modelName: 'coqui/XTTS-v2', displayName: 'XTTS v2 多语言TTS',
    modelType: 'audio', description: 'Coqui开源多语言TTS，支持17种语言，零样本声音克隆，可复制任何人的声音，支持语速和情感调节',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署或使用第三方API。支持声音克隆：在高级配置中设置 {"reference_audio":"参考音频URL"}。支持语速调节(speed 0.5-2.0)。部署：pip install TTS',
    docsUrl: 'https://github.com/coqui-ai/TTS',
  },
  // ChatTTS - 对话式TTS，中文支持好
  {
    provider: 'custom-openai', providerName: 'ChatTTS (开源)',
    modelName: '2Noise/ChatTTS', displayName: 'ChatTTS 对话式TTS',
    modelType: 'audio', description: '专为对话场景设计的开源TTS，中文支持优秀，自然度高，支持笑声、停顿、语气词等细粒度控制',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署或使用第三方API。支持细粒度控制：在高级配置中设置 {"oral":"口语化程度","laugh":"笑声","break":"停顿"}。支持语速调节。部署：pip install ChatTTS',
    docsUrl: 'https://github.com/2noise/ChatTTS',
  },
  // CosyVoice - 阿里开源多语言TTS
  {
    provider: 'custom-openai', providerName: 'CosyVoice (开源)',
    modelName: 'FunAudioLLM/CosyVoice', displayName: 'CosyVoice 阿里开源TTS',
    modelType: 'audio', description: '阿里开源的多语言TTS，支持中文、英文、日语、韩语，零样本声音克隆，高自然度，支持情感和语速调节',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署或使用第三方API。支持声音克隆和情感控制。部署参考：https://github.com/FunAudioLLM/CosyVoice',
    docsUrl: 'https://github.com/FunAudioLLM/CosyVoice',
  },
  // Fish Speech - 开源多语言TTS
  {
    provider: 'custom-openai', providerName: 'Fish Speech (开源)',
    modelName: 'fishaudio/fish-speech', displayName: 'Fish Speech 开源TTS',
    modelType: 'audio', description: '开源多语言TTS，支持中文、英文、日语，高自然度，支持声音克隆和情感调节，推理速度快',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署或使用官方API。官方API：https://api.fish.audio/v1。支持声音克隆和语速调节。部署：https://github.com/fishaudio/fish-speech',
    docsUrl: 'https://github.com/fishaudio/fish-speech',
  },
  // Piper - 轻量级本地TTS
  {
    provider: 'custom-openai', providerName: 'Piper (开源)',
    modelName: 'rhasspy/piper', displayName: 'Piper 轻量级TTS',
    modelType: 'audio', description: '快速、轻量级的本地TTS引擎，支持多语言，CPU即可运行，适合离线场景，支持语速调节',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署。端点URL示例：http://localhost:5000。支持语速调节(length_scale 0.5-2.0)。部署：pip install piper-tts',
    docsUrl: 'https://github.com/rhasspy/piper',
  },
  // MeloTTS - 微软开源多语言TTS
  {
    provider: 'custom-openai', providerName: 'MeloTTS (开源)',
    modelName: 'myshell-ai/MeloTTS', displayName: 'MeloTTS 微软开源TTS',
    modelType: 'audio', description: '微软开源的高质量多语言TTS，支持中文、英文、日语、韩语、法语、西班牙语、德语，速度快，自然度高',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署或使用第三方API。支持语速调节。部署：pip install meloTTS',
    docsUrl: 'https://github.com/myshell-ai/MeloTTS',
  },
  // Parler-TTS - 基于描述的TTS
  {
    provider: 'custom-openai', providerName: 'Parler-TTS (开源)',
    modelName: 'parler-tts/parler-tts-mini', displayName: 'Parler-TTS 描述式TTS',
    modelType: 'audio', description: '基于文本描述的生成式TTS，可通过描述控制语音的性别、年龄、语气、情感、语速、口音等，高度可定制',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署或使用HuggingFace API。通过描述控制语音：在高级配置中设置 {"description":"一位年轻女性，温柔的语气，中等语速"}。部署：pip install parler-tts',
    docsUrl: 'https://github.com/huggingface/parler-tts',
  },
  // GPT-SoVITS - 中文声音克隆TTS
  {
    provider: 'custom-openai', providerName: 'GPT-SoVITS (开源)',
    modelName: 'RVC-Boss/GPT-SoVITS', displayName: 'GPT-SoVITS 声音克隆TTS',
    modelType: 'audio', description: '少样本声音克隆TTS，只需5秒参考音频即可克隆任何人的声音，中文支持优秀，支持情感和语速调节',
    supports: { customEndpoint: true },
    defaultVoice: 'default',
    costEstimate: { perSecond: 0 },
    configHint: '需本地部署。支持5秒少样本声音克隆。在高级配置中设置 {"reference_audio":"参考音频路径","reference_text":"参考音频文本"}。部署：https://github.com/RVC-Boss/GPT-SoVITS',
    docsUrl: 'https://github.com/RVC-Boss/GPT-SoVITS',
  },
];

// ---------- 厂商 API Key 申请页面 ----------

const PROVIDER_SIGNUP_URLS: Record<string, string> = {
  // 文本模型
  openai: 'https://platform.openai.com/api-keys',
  'openai-image': 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  doubao: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  'doubao-image': 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  qwen: 'https://dashscope.console.aliyun.com/apiKey',
  'qwen-image': 'https://dashscope.console.aliyun.com/apiKey',
  'wan-image': 'https://dashscope.console.aliyun.com/apiKey',
  zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
  'zhipu-image': 'https://open.bigmodel.cn/usercenter/apikeys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  moonshot: 'https://platform.moonshot.cn/console/api-keys',
  minimax: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  'minimax-audio': 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  xfyun: 'https://console.xfyun.cn/services/bm35',
  siliconflow: 'https://cloud.siliconflow.cn/account/ak',
  // 图像模型
  stability: 'https://platform.stability.ai/account/keys',
  ideogram: 'https://ideogram.ai/settings/api',
  recraft: 'https://www.recraft.ai/',
  flux: 'https://api.bfl.ml/',
  'siliconflow-image': 'https://cloud.siliconflow.cn/account/ak',
  // 视频模型
  runway: 'https://dev.runwayml.com/',
  pika: 'https://pika.art/',
  kling: 'https://klingai.com/',
  jimeng: 'https://console.volcengine.com/ai/overview',
  hailuo: 'https://platform.minimaxi.com/',
  'minimax-video': 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  happyhorse: 'https://dashscope.console.aliyun.com/apiKey',
  // 音频模型
  elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
  azure: 'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/SpeechServices',
  'edge-tts': '', // 免费无需API Key
  // 自定义/本地
  'custom-openai': '', // 用户自定义端点
  ollama: 'https://ollama.com/download', // 本地部署
};

// ---------- 视觉理解模型（VLM：视频质量门 / 一致性 Critic） ----------
// 需要支持图片输入（多模态）的文本模型，用于：
// 1. 视频质量门：检查生成视频首尾帧主体一致性、幻觉多脸、字幕残留
// 2. 一致性 Critic：对镜头间角色/场景连续性打分，低分自动重渲染

const VISION_MODELS: ModelMeta[] = [
  { provider: 'doubao', providerName: '字节豆包', modelName: 'doubao-1-5-vision-pro-32k-250115', displayName: '豆包视觉 Pro', modelType: 'vision', description: '多模态视觉理解模型，图像识别与描述，视频质量门推荐', supports: { jsonOutput: true, customEndpoint: true }, costEstimate: { perImage: 0.005 } },
  { provider: 'doubao', providerName: '字节豆包', modelName: 'doubao-seed-1-6-vision-250815', displayName: '豆包 Seed 视觉', modelType: 'vision', description: '新一代多模态模型，细粒度图像理解，视频帧一致性评分', supports: { jsonOutput: true, customEndpoint: true }, costEstimate: { perImage: 0.004 } },
  { provider: 'qwen', providerName: '阿里通义', modelName: 'qwen-vl-max-latest', displayName: '通义千问 VL Max', modelType: 'vision', description: '阿里旗舰视觉语言模型，图像理解与跨帧分析', supports: { jsonOutput: true, customEndpoint: true }, costEstimate: { perImage: 0.008 } },
  { provider: 'qwen', providerName: '阿里通义', modelName: 'qwen-vl-plus-latest', displayName: '通义千问 VL Plus', modelType: 'vision', description: '性价比视觉理解模型，适合批量质量门', supports: { jsonOutput: true, customEndpoint: true }, costEstimate: { perImage: 0.003 } },
  { provider: 'zhipu', providerName: '智谱 AI', modelName: 'glm-4v-plus', displayName: '智谱 GLM-4V Plus', modelType: 'vision', description: '多模态理解模型，图像内容与一致性分析', supports: { jsonOutput: true, customEndpoint: true }, costEstimate: { perImage: 0.006 } },
  { provider: 'openai', providerName: 'OpenAI', modelName: 'gpt-4o-mini', displayName: 'GPT-4o mini', modelType: 'vision', description: 'OpenAI 多模态模型，视觉理解能力强（需模型支持图片输入）', supports: { jsonOutput: true, customEndpoint: true }, costEstimate: { perImage: 0.002 } },
  { provider: 'custom-openai', providerName: '自定义 OpenAI 兼容', modelName: 'custom-vision', displayName: '自定义视觉模型', modelType: 'vision', description: '任选支持图片输入的 OpenAI 兼容视觉模型，在端点配置中填入模型名', supports: { jsonOutput: true, customEndpoint: true }, costEstimate: { perImage: 0.003 } },
];

// ---------- 全量注册表 ----------

const RAW_REGISTRY: ModelMeta[] = [
  ...TEXT_MODELS,
  ...IMAGE_MODELS,
  ...VIDEO_MODELS,
  ...AUDIO_MODELS,
  ...VISION_MODELS,
];

// 根据模型名和描述自动推断适用场景（导出供测试）
export function inferScenarios(m: ModelMeta): string[] {
  if (m.scenarios && m.scenarios.length > 0) return m.scenarios;
  const name = m.modelName.toLowerCase();
  const desc = m.description.toLowerCase();
  const scenarios: string[] = [];

  // 推理相关
  if (name.includes('reasoner') || name.includes('o1') || desc.includes('推理') || desc.includes('深度思考')) {
    scenarios.push('复杂推理');
  }
  // 视觉/多模态
  if (name.includes('vision') || desc.includes('视觉') || desc.includes('多模态') || desc.includes('图片')) {
    scenarios.push('图片理解');
  }
  // 长上下文
  if (name.includes('256k') || name.includes('128k') || name.includes('long') || desc.includes('长上下文') || desc.includes('1m')) {
    scenarios.push('长文本分析');
  }
  // 轻量/高速
  if (name.includes('lite') || name.includes('mini') || name.includes('flash') || name.includes('turbo') || desc.includes('轻量') || desc.includes('高速')) {
    scenarios.push('高并发');
    scenarios.push('低成本');
  }
  // Pro/旗舰
  if ((name.includes('pro') || desc.includes('旗舰')) && !name.includes('lite') && !name.includes('mini')) {
    scenarios.push('剧本创作');
  }
  // 默认通用
  if (scenarios.length === 0) {
    scenarios.push('通用对话');
    scenarios.push('内容生成');
  }
  return scenarios.slice(0, 3);
}

export const MODEL_REGISTRY: ModelMeta[] = RAW_REGISTRY.map((m) => ({
  ...m,
  signupUrl: m.signupUrl || PROVIDER_SIGNUP_URLS[m.provider],
  scenarios: inferScenarios(m),
}));

export function getModelsByType(type: ModelType): ModelMeta[] {
  return MODEL_REGISTRY.filter((m) => m.modelType === type);
}

export function getModelMeta(provider: string, modelName: string): ModelMeta | undefined {
  return MODEL_REGISTRY.find((m) => m.provider === provider && m.modelName === modelName);
}

export function getModelKey(provider: string, modelName: string): string {
  return `${provider}:${modelName}`;
}

export function parseModelKey(key: string): { provider: string; modelName: string } {
  const [provider, ...rest] = key.split(':');
  return { provider, modelName: rest.join(':') };
}
