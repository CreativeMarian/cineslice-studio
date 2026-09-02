// 文件名编码修复工具
// multer 在 Windows 下以 latin1 解析中文文件名，导致乱码

/**
 * 修复 multer 上传的中文文件名乱码问题
 * multer 默认以 latin1 解码 multipart 中的 filename，中文会变成乱码
 * 需要转回 UTF-8
 */
export function decodeFilename(originalName: string): string {
  if (!originalName) return originalName;
  try {
    // 如果原始名称已经包含中文，说明已经是正确的 UTF-8
    if (/[\u4e00-\u9fa5]/.test(originalName)) {
      return originalName;
    }
    // 尝试从 latin1 转回 UTF-8
    const reEncoded = Buffer.from(originalName, 'latin1').toString('utf8');
    // 如果转回后包含有效中文字符，则使用转回后的名称
    if (/[\u4e00-\u9fa5]/.test(reEncoded)) {
      return reEncoded;
    }
    // 检测乱码特征（如 æ–‡ä»¶ 这种 UTF-8 被当作 latin1 的情况）
    // 再次尝试
    const doubleDecoded = Buffer.from(reEncoded, 'latin1').toString('utf8');
    if (/[\u4e00-\u9fa5]/.test(doubleDecoded)) {
      return doubleDecoded;
    }
    return originalName;
  } catch {
    return originalName;
  }
}

/**
 * 净化用户提供的文件名：只保留基础文件名，杜绝路径穿越。
 * 传入 "../x" / "..\x" / "a/b.mp3" 一律折叠为基础名；空名或纯 ".." 返回 null。
 */
export function sanitizeFileName(input: string): string | null {
  if (typeof input !== 'string' || input.trim() === '') return null;
  const base = input.replace(/[\\/]/g, '/').split('/').pop() || '';
  const trimmed = base.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return null;
  if (trimmed.includes('\0')) return null;
  return trimmed;
}

/**
 * 校验解析后的路径确实位于 baseDir 内（防止 resolve 后逃逸）。
 */
export function isPathInside(baseDir: string, targetPath: string): boolean {
  const sep = process.platform === 'win32' ? '\\' : '/';
  const resolvedBase = baseDir.endsWith(sep) ? baseDir : baseDir + sep;
  const normBase = baseDir.normalize();
  const normTarget = targetPath.normalize();
  return normTarget === normBase || normTarget.startsWith(resolvedBase);
}

/**
 * 校验项目/资源 ID 格式（路由 :id 用于拼文件路径时必须通过）。
 */
export function isValidResourceId(id: string): boolean {
  return typeof id === 'string' && /^[\w][\w-]{0,63}$/.test(id);
}
