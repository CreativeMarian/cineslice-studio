// 小说章节解析（前端辅助）
// v2.0 — 修复前N集丢失，支持 Markdown 标题前缀、中文数字、多种集数标记
// 支持多种章节标题模式，无匹配时按字数粗略拆分

// ── 中文数字转阿拉伯数字 ──
const CN_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100, 千: 1000,
  壹: 1, 贰: 2, 叁: 3, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9,
  拾: 10, 佰: 100, 仟: 1000,
};

export function chineseToNumber(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  let result = 0;
  let current = 0;
  const chars = trimmed.split('');

  for (const ch of chars) {
    const val = CN_DIGITS[ch];
    if (val === undefined) continue;
    if (val >= 10) {
      if (current === 0) current = 1;
      result += current * val;
      current = 0;
    } else {
      current = val;
    }
  }
  result += current;
  return result > 0 ? result : null;
}

// 范围标题排除（如 "第六至十集"）
const RANGE_EXCLUDE = '(?!.*(?:至|到|—|~|\\-)\\s*[一二三四五六七八九十百千零\\d])';

const CHAPTER_PATTERNS = [
  // 优先按集数标记分割（剧本/分集大纲格式），可选 Markdown 前缀
  new RegExp(`^(?:#{1,6}\\s+)?第\\s*([一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟\\d]+)\\s*集\\s*[:：\\-]?\\s*(.*)${RANGE_EXCLUDE}$`, 'm'),
  new RegExp(`^(?:#{1,6}\\s+)?第\\s*([一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟\\d]+)\\s*话\\s*[:：\\-]?\\s*(.*)${RANGE_EXCLUDE}$`, 'm'),
  /^(?:#{1,6}\s+)?(?:Episode|EP)\s+(\d+)\s*[:：-]?\s*(.*)$/im,
  // 章/回/节/卷/篇
  new RegExp(`^(?:#{1,6}\\s+)?第\\s*([一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟\\d]+)\\s*[章回节卷篇]\\s*[:：\\-]?\\s*(.*)${RANGE_EXCLUDE}$`, 'm'),
  /^(?:#{1,6}\s+)?Chapter\s+(\d+)\s*[:：-]?\s*(.*)$/im,
  // Markdown 标题兜底
  /^(?:#{1,6}\s+)(.+)$/m,
];

export interface ParsedChapter {
  chapterNumber: number;
  /** 解析出的集/章序号（中文数字已转阿拉伯数字） */
  episodeNumber: number | null;
  title: string;
  content: string;
  wordCount: number;
  /** 原始行号（1-based） */
  lineNumber: number;
}

export function parseNovelChapters(text: string, wordsPerChapter = 3000): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];

  // 尝试匹配章节标题
  let matched = false;
  for (const pattern of CHAPTER_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    const matches = [...text.matchAll(regex)];
    if (matches.length >= 2) {
      matched = true;
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const startIndex = match.index || 0;
        const endIndex = i + 1 < matches.length ? (matches[i + 1].index || text.length) : text.length;
        const numStr = match[1] || '';
        const episodeNumber = chineseToNumber(numStr);
        // 标题 = 去除 Markdown 前缀后的完整匹配行
        const title = match[0].trim().replace(/^#+\s*/, '');
        const content = text.slice(startIndex, endIndex).trim();
        // 计算行号
        const lineNumber = text.slice(0, startIndex).split(/\r?\n/).length;
        chapters.push({
          chapterNumber: i + 1,
          episodeNumber,
          title,
          content,
          wordCount: content.length,
          lineNumber,
        });
      }
      break;
    }
  }

  // 无匹配时按字数粗略拆分
  if (!matched) {
    const totalLength = text.length;
    const count = Math.ceil(totalLength / wordsPerChapter);
    for (let i = 0; i < count; i++) {
      const start = i * wordsPerChapter;
      const end = Math.min((i + 1) * wordsPerChapter, totalLength);
      const content = text.slice(start, end).trim();
      if (content) {
        chapters.push({
          chapterNumber: i + 1,
          episodeNumber: i + 1,
          title: `第${i + 1}章`,
          content,
          wordCount: content.length,
          lineNumber: 0,
        });
      }
    }
  }

  return chapters;
}

export function formatWordCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万字`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}千字`;
  return `${count}字`;
}
