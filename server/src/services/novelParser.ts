// 小说章节解析（正则 + 字数兜底）
// v2.0 — 修复前N集丢失，支持 Markdown 标题前缀、中文数字、多种集数标记

export interface ParsedChapter {
  title: string;
  content: string;
  wordCount: number;
  /** 解析出的集/章序号（中文数字已转阿拉伯数字），无法解析时为 null */
  episodeNumber: number | null;
  /** 原始行号（1-based），便于日志定位 */
  lineNumber: number;
}

// ── 中文数字转阿拉伯数字 ──
const CN_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100, 千: 1000,
  壹: 1, 贰: 2, 叁: 3, 肆: 4, 伍: 5, 陆: 6, 柒: 7, 捌: 8, 玖: 9,
  拾: 10, 佰: 100, 仟: 1000,
};

/**
 * 将中文数字字符串转为阿拉伯数字。
 * 支持：一、十、十一、二十、二十一、一百、一百零一、两百、壹佰贰拾叁 等。
 * 纯阿拉伯数字直接返回。
 */
export function chineseToNumber(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  // 纯数字
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  let result = 0;
  let current = 0;
  const chars = trimmed.split('');

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const val = CN_DIGITS[ch];
    if (val === undefined) continue;

    if (val >= 10) {
      // 单位字（十、百、千）
      if (current === 0) current = 1; // "十一" → 1*10
      result += current * val;
      current = 0;
    } else {
      // 数字字
      current = val;
    }
  }
  result += current;

  return result > 0 ? result : null;
}

// ── 集数标记正则（可选 Markdown 标题前缀，排除"第X至Y集"范围标题）──
// 范围标题特征：数字后紧跟 至/到/-/—/~ 再接数字
const RANGE_EXCLUDE = '(?!.*(?:至|到|—|~|\\-)\\s*[一二三四五六七八九十百千零\\d])';

const EPISODE_PATTERNS: RegExp[] = [
  // 第X集 / 第X话（中文数字或阿拉伯数字，可选 Markdown 前缀，可选空格）
  new RegExp(`^(?:#{1,6}\\s+)?第\\s*([一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟\\d]+)\\s*[集话][\\s:：\\-．.、]*(.*)${RANGE_EXCLUDE}$`),
  // Episode X / EP X
  /^(?:#{1,6}\s+)?(?:Episode|EP)\s*(\d+)\s*[:：-]?\s*(.*)$/i,
  // 纯 "X集" / "X话"（无"第"字，如 "一集"）
  new RegExp(`^(?:#{1,6}\\s+)?([一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟\\d]+)\\s*[集话][\\s:：\\-．.、]*(.*)${RANGE_EXCLUDE}$`),
];

const CHAPTER_PATTERNS: RegExp[] = [
  // 第X章/节/回/卷/篇
  new RegExp(`^(?:#{1,6}\\s+)?第\\s*([一二三四五六七八九十百千零两壹贰叁肆伍陆柒捌玖拾佰仟\\d]+)\\s*[章回节卷篇][\\s:：\\-．.、]*(.*)${RANGE_EXCLUDE}$`),
  // Chapter X
  /^(?:#{1,6}\s+)?Chapter\s+(\d+)\s*[:：-]?\s*(.*)$/i,
  // Markdown 标题（兜底，仅当上面都不匹配时）
  /^(?:#{1,6}\s+)(.+)$/,
];

function countWords(text: string): number {
  if (!text) return 0;
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

interface MatchedHeader {
  lineNumber: number;
  rawLine: string;
  title: string;
  episodeNumber: number | null;
}

/**
 * 逐行扫描，返回所有匹配的章节头信息。
 * 同时记录日志：识别到的章节标题和行号。
 */
function findHeaders(content: string, patterns: RegExp[]): MatchedHeader[] {
  const lines = content.split(/\r?\n/);
  const headers: MatchedHeader[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    for (const pattern of patterns) {
      // 重置正则 lastIndex（防止带 g 标志的残留状态）
      pattern.lastIndex = 0;
      const m = pattern.exec(line);
      if (m) {
        const numStr = m[1] || '';
        const episodeNumber = chineseToNumber(numStr);
        // 标题 = 去除 Markdown 前缀后的完整行（保持"第X集 标题"格式，兼容现有测试）
        const title = line.replace(/^#{1,6}\s+/, '');
        headers.push({
          lineNumber: i + 1,
          rawLine: line,
          title,
          episodeNumber,
        });
        console.log(`[NovelParser] 行${i + 1}: 识别章节 "${title}"${episodeNumber ? ` (第${episodeNumber}集/章)` : ''}`);
        break; // 一行只匹配第一个模式
      }
    }
  }

  return headers;
}

/**
 * 根据匹配到的章节头，将内容切分为章节数组。
 */
function splitByHeaders(content: string, headers: MatchedHeader[]): ParsedChapter[] {
  const lines = content.split(/\r?\n/);
  const chapters: ParsedChapter[] = [];

  // 处理第一个 header 之前的序言内容
  if (headers.length > 0 && headers[0].lineNumber > 1) {
    const prefaceLines = lines.slice(0, headers[0].lineNumber - 1);
    const prefaceContent = prefaceLines.join('\n').trim();
    if (prefaceContent) {
      chapters.push({
        title: '序言',
        content: prefaceContent,
        wordCount: countWords(prefaceContent),
        episodeNumber: null,
        lineNumber: 1,
      });
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const startLine = header.lineNumber; // 包含标题行
    const endLine = i + 1 < headers.length ? headers[i + 1].lineNumber - 1 : lines.length;
    // 内容从标题行的下一行开始
    const contentLines = lines.slice(startLine, endLine);
    const chapterContent = contentLines.join('\n').trim();

    chapters.push({
      title: header.title,
      content: chapterContent,
      wordCount: countWords(chapterContent),
      episodeNumber: header.episodeNumber,
      lineNumber: header.lineNumber,
    });
  }

  return chapters;
}

function splitByWordCount(content: string, wordsPerChapter = 3000): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  const paragraphs = content.split(/\r?\n\s*\r?\n/);
  let currentContent = '';
  let currentWords = 0;
  let chapterNum = 1;

  for (const para of paragraphs) {
    const paraWords = countWords(para);
    if (currentWords + paraWords > wordsPerChapter && currentContent) {
      chapters.push({
        title: `第${chapterNum}章`,
        content: currentContent.trim(),
        wordCount: currentWords,
        episodeNumber: chapterNum,
        lineNumber: 0,
      });
      chapterNum++;
      currentContent = para;
      currentWords = paraWords;
    } else {
      currentContent += (currentContent ? '\n\n' : '') + para;
      currentWords += paraWords;
    }
  }

  if (currentContent.trim()) {
    chapters.push({
      title: `第${chapterNum}章`,
      content: currentContent.trim(),
      wordCount: currentWords,
      episodeNumber: chapterNum,
      lineNumber: 0,
    });
  }

  return chapters;
}

/**
 * 校验章节连续性：如果检测到第6集及以后但缺少第1-5集，输出警告。
 */
function validateChapterContinuity(chapters: ParsedChapter[]): void {
  const episodeNums = chapters
    .map(c => c.episodeNumber)
    .filter((n): n is number => n !== null && n > 0);

  if (episodeNums.length === 0) return;

  const maxNum = Math.max(...episodeNums);
  const numSet = new Set(episodeNums);

  // 检测到 >=6 但缺少 1-5 中的某些
  if (maxNum >= 6) {
    const missing: number[] = [];
    for (let i = 1; i <= Math.min(maxNum, 10); i++) {
      if (!numSet.has(i)) missing.push(i);
    }
    if (missing.length > 0) {
      console.warn(
        `[NovelParser][警告] 检测到第${maxNum}集，但缺少第${missing.join('、')}集。` +
        `可能原因：章节标记格式不统一（如部分带 Markdown ### 前缀）、中文数字未识别、或文件确实缺失。`
      );
    }
  }
}

export function parseNovel(content: string): ParsedChapter[] {
  if (!content || !content.trim()) {
    return [];
  }

  console.log('[NovelParser] 开始解析小说...');

  // 优先按集数标记分割（剧本/分集大纲格式）
  const episodeHeaders = findHeaders(content, EPISODE_PATTERNS);
  if (episodeHeaders.length >= 2) {
    console.log(`[NovelParser] 使用集数标记匹配到 ${episodeHeaders.length} 集`);
    const chapters = splitByHeaders(content, episodeHeaders);
    validateChapterContinuity(chapters);
    return chapters;
  }

  // 常见章节标题模式
  const chapterHeaders = findHeaders(content, CHAPTER_PATTERNS);
  if (chapterHeaders.length >= 2) {
    console.log(`[NovelParser] 使用章节模式匹配到 ${chapterHeaders.length} 章`);
    const chapters = splitByHeaders(content, chapterHeaders);
    validateChapterContinuity(chapters);
    return chapters;
  }

  // 兜底：按 3000 字拆分
  console.log('[NovelParser] 未匹配到章节标记，使用字数兜底拆分');
  const chapters = splitByWordCount(content, 3000);
  console.log(`[NovelParser] 字数兜底拆分为 ${chapters.length} 章`);
  return chapters;
}

// 合并章节
export function mergeChapters(chapters: ParsedChapter[]): ParsedChapter {
  const content = chapters.map(c => c.content).join('\n\n');
  return {
    title: chapters[0]?.title || '合并章节',
    content,
    wordCount: countWords(content),
    episodeNumber: chapters[0]?.episodeNumber ?? null,
    lineNumber: chapters[0]?.lineNumber ?? 0,
  };
}

// 拆分章节
export function splitChapter(chapter: ParsedChapter, splitPosition: number): [ParsedChapter, ParsedChapter] {
  const content = chapter.content;
  const first = content.substring(0, splitPosition);
  const second = content.substring(splitPosition);
  return [
    {
      title: chapter.title + '（上）',
      content: first,
      wordCount: countWords(first),
      episodeNumber: chapter.episodeNumber,
      lineNumber: chapter.lineNumber,
    },
    {
      title: chapter.title + '（下）',
      content: second,
      wordCount: countWords(second),
      episodeNumber: chapter.episodeNumber,
      lineNumber: chapter.lineNumber,
    },
  ];
}
