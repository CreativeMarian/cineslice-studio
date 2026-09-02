import { describe, it, expect } from 'vitest';
import { parseNovel, mergeChapters, splitChapter } from '../../server/src/services/novelParser';

describe('novelParser', () => {
  describe('parseNovel', () => {
    it('空内容返回空数组', () => {
      expect(parseNovel('')).toEqual([]);
      expect(parseNovel('   ')).toEqual([]);
      expect(parseNovel(null as any)).toEqual([]);
      expect(parseNovel(undefined as any)).toEqual([]);
    });

    it('识别"第X章"模式', () => {
      const content = '第一章 开始\n这是第一章内容。\n\n第二章 继续\n这是第二章内容。';
      const chapters = parseNovel(content);
      expect(chapters).toHaveLength(2);
      expect(chapters[0].title).toBe('第一章 开始');
      expect(chapters[0].content).toContain('这是第一章内容');
      expect(chapters[1].title).toBe('第二章 继续');
    });

    it('识别"第X节"模式', () => {
      const content = '第一节 开头\n内容一。\n第二节 发展\n内容二。';
      const chapters = parseNovel(content);
      expect(chapters).toHaveLength(2);
      expect(chapters[0].title).toBe('第一节 开头');
    });

    it('识别"第X回"模式', () => {
      const content = '第一回 缘起\n内容。\n第二回 缘灭\n内容。';
      const chapters = parseNovel(content);
      expect(chapters).toHaveLength(2);
    });

    it('识别"Chapter X"模式（不区分大小写）', () => {
      const content = 'Chapter 1 Beginning\nContent one.\nChapter 2 Continuing\nContent two.';
      const chapters = parseNovel(content);
      expect(chapters).toHaveLength(2);
      expect(chapters[0].title).toBe('Chapter 1 Beginning');
    });

    it('识别 Markdown ## 标题模式', () => {
      const content = '## 第一章\n内容一\n## 第二章\n内容二';
      const chapters = parseNovel(content);
      expect(chapters.length).toBeGreaterThanOrEqual(2);
    });

    it('单章内容返回 1 章（字数兜底）', () => {
      const content = '这是一段没有章节标题的小说内容。'.repeat(100);
      const chapters = parseNovel(content);
      expect(chapters.length).toBeGreaterThanOrEqual(1);
      expect(chapters[0].wordCount).toBeGreaterThan(0);
    });

    it('每章 wordCount 正确计算', () => {
      const content = '第一章 测试\n你好世界\n第二章 测试2\nfoo bar';
      const chapters = parseNovel(content);
      expect(chapters[0].wordCount).toBe(4); // 你好世界
      expect(chapters[1].wordCount).toBe(2); // foo bar
    });

    it('章节标题前的序言内容作为第一章', () => {
      const content = '序言内容\n第一章 开始\n正文';
      const chapters = parseNovel(content);
      // 序言 + 第一章 = 至少2章
      expect(chapters.length).toBeGreaterThanOrEqual(1);
    });

    it('识别带 Markdown ### 前缀的"第X集"（修复前5集丢失）', () => {
      const content = '### 第一集：开端\n内容一\n### 第二集：发展\n内容二\n第六集：高潮\n内容六';
      const chapters = parseNovel(content);
      // 应识别到3集（第一、第二、第六）
      const episodeTitles = chapters.map(c => c.title);
      expect(episodeTitles).toContain('第一集：开端');
      expect(episodeTitles).toContain('第二集：发展');
      expect(episodeTitles).toContain('第六集：高潮');
    });

    it('episodeNumber 正确解析中文数字', () => {
      const content = '### 第一集：开端\n内容一\n### 第十一集：中段\n内容二\n### 第三十集：结局\n内容三';
      const chapters = parseNovel(content);
      const nums = chapters.map(c => c.episodeNumber);
      expect(nums).toContain(1);
      expect(nums).toContain(11);
      expect(nums).toContain(30);
    });

    it('排除"第X至Y集"范围标题，不单独作为章节', () => {
      const content = '### 第六至十集：单元概述\n第六集：a\n内容\n第七集：b\n内容';
      const chapters = parseNovel(content);
      // "第六至十集"不应被识别为独立章节，只识别第六、第七集
      const episodeTitles = chapters.map(c => c.title);
      expect(episodeTitles).toContain('第六集：a');
      expect(episodeTitles).toContain('第七集：b');
      expect(episodeTitles).not.toContain('第六至十集：单元概述');
    });

    it('支持 Episode X 和 EP X 格式', () => {
      const content = 'Episode 1: Beginning\nContent one.\nEP 2: Continuing\nContent two.';
      const chapters = parseNovel(content);
      expect(chapters.length).toBeGreaterThanOrEqual(2);
      expect(chapters[0].episodeNumber).toBe(1);
      expect(chapters[1].episodeNumber).toBe(2);
    });

    it('lineNumber 记录正确的行号', () => {
      const content = '序言\n第一集 开端\n内容\n第二集 发展\n内容';
      const chapters = parseNovel(content);
      const firstEpisode = chapters.find(c => c.title.includes('第一集'));
      expect(firstEpisode?.lineNumber).toBe(2);
    });
  });

  describe('mergeChapters', () => {
    it('合并多章内容', () => {
      const chapters = [
        { title: '第一章', content: '内容一', wordCount: 3 },
        { title: '第二章', content: '内容二', wordCount: 3 },
      ];
      const merged = mergeChapters(chapters);
      expect(merged.title).toBe('第一章');
      expect(merged.content).toContain('内容一');
      expect(merged.content).toContain('内容二');
      expect(merged.wordCount).toBe(6);
    });

    it('空数组合并返回默认标题', () => {
      const merged = mergeChapters([]);
      expect(merged.title).toBe('合并章节');
      expect(merged.content).toBe('');
    });
  });

  describe('splitChapter', () => {
    it('按位置拆分为两章', () => {
      const chapter = { title: '第一章', content: '你好世界', wordCount: 4 };
      const [first, second] = splitChapter(chapter, 2);
      expect(first.title).toContain('上');
      expect(second.title).toContain('下');
      expect(first.content).toBe('你好');
      expect(second.content).toBe('世界');
    });

    it('拆分位置为 0 时第一章为空', () => {
      const chapter = { title: '第一章', content: '你好', wordCount: 2 };
      const [first, second] = splitChapter(chapter, 0);
      expect(first.content).toBe('');
      expect(second.content).toBe('你好');
    });
  });
});
