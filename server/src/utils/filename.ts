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
