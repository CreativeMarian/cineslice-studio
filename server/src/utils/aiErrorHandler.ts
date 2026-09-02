// AI API 错误处理工具
// v1.0 - 将各种API错误转换为用户友好的中文提示

import { AIError } from '../services/adapters/base';

/**
 * 常见API错误模式映射
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  code: string;
  message: string;
  suggestion?: string;
}> = [
  // 余额不足
  {
    pattern: /insufficient balance|余额不足|balance.*not enough|quota.*exceeded/i,
    code: 'INSUFFICIENT_BALANCE',
    message: '账户余额不足',
    suggestion: '请前往对应平台充值，或更换其他模型/厂商',
  },
  // API Key无效
  {
    pattern: /invalid api key|unauthorized|401|api key.*invalid|认证失败|invalid.*token/i,
    code: 'INVALID_API_KEY',
    message: 'API Key 无效或已过期',
    suggestion: '请检查API Key是否正确，或重新生成API Key',
  },
  // 模型不存在
  {
    pattern: /model.*not found|does not exist|404|model.*invalid|找不到模型/i,
    code: 'MODEL_NOT_FOUND',
    message: '模型不存在或无权限访问',
    suggestion: '请检查模型名称是否正确，或确认该模型是否已在平台开通',
  },
  // 请求过于频繁
  {
    pattern: /rate limit|429|too many requests|请求过于频繁|频率限制|concurrent.*limit/i,
    code: 'RATE_LIMITED',
    message: '请求过于频繁，已触发速率限制',
    suggestion: '请稍后重试，或降低并发请求数量',
  },
  // 参数错误
  {
    pattern: /invalid parameter|bad request|400|参数错误|invalid.*request/i,
    code: 'INVALID_PARAMETER',
    message: '请求参数错误',
    suggestion: '请检查输入内容是否符合要求，或联系技术支持',
  },
  // 上下文过长
  {
    pattern: /context length|maximum context|token.*limit|上下文过长|context.*exceed/i,
    code: 'CONTEXT_TOO_LONG',
    message: '输入内容过长，超出模型上下文限制',
    suggestion: '请缩短输入内容，或选择支持更长上下文的模型',
  },
  // 服务器错误
  {
    pattern: /internal server error|500|server error|服务器错误|service unavailable|503/i,
    code: 'SERVER_ERROR',
    message: 'AI服务服务器错误',
    suggestion: '服务暂时不可用，请稍后重试',
  },
  // 超时
  {
    pattern: /timeout|timed out|超时|request.*aborted/i,
    code: 'TIMEOUT',
    message: '请求超时',
    suggestion: '网络不稳定或服务响应慢，请稍后重试',
  },
  // 内容审核
  {
    pattern: /content policy|safety|内容违规|敏感内容|moderation|inappropriate/i,
    code: 'CONTENT_POLICY',
    message: '内容触发安全审核策略',
    suggestion: '请修改输入内容，避免敏感或违规词汇',
  },
  // 接入点错误（火山方舟）
  {
    pattern: /invalid endpoint|endpoint.*not found|接入点.*无效|endpoint.*error/i,
    code: 'INVALID_ENDPOINT',
    message: '接入点ID无效或模型不匹配',
    suggestion: '请检查接入点ID(ep-xxx)是否正确，确认该接入点绑定的模型类型',
  },
];

/**
 * 解析AI API错误，返回用户友好的错误信息
 */
export function parseAIError(err: unknown): {
  code: string;
  message: string;
  suggestion?: string;
  originalError?: string;
} {
  let errorMessage = '';
  
  if (err instanceof AIError) {
    errorMessage = err.message;
  } else if (err instanceof Error) {
    errorMessage = err.message;
  } else if (typeof err === 'string') {
    errorMessage = err;
  } else {
    errorMessage = JSON.stringify(err);
  }

  // 匹配已知错误模式
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      return {
        code: pattern.code,
        message: pattern.message,
        suggestion: pattern.suggestion,
        originalError: errorMessage,
      };
    }
  }

  // 默认错误
  return {
    code: 'UNKNOWN_ERROR',
    message: 'AI调用失败',
    suggestion: '请检查网络连接和模型配置，或稍后重试',
    originalError: errorMessage,
  };
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(err: unknown): boolean {
  const parsed = parseAIError(err);
  const retryableCodes = [
    'RATE_LIMITED',
    'SERVER_ERROR',
    'TIMEOUT',
    'UNKNOWN_ERROR',
  ];
  return retryableCodes.includes(parsed.code);
}

/**
 * 格式化错误信息用于日志
 */
export function formatAIErrorForLog(err: unknown, provider?: string, model?: string): string {
  const parsed = parseAIError(err);
  const context = provider && model ? `[${provider}/${model}] ` : '';
  return `${context}${parsed.code}: ${parsed.message}${parsed.suggestion ? ` (建议: ${parsed.suggestion})` : ''}`;
}
