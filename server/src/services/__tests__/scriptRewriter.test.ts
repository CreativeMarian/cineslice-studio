// P1-28: 剧本拆集单元测试
// 覆盖 splitScriptToEpisodes：
//   - 标准【第X集】拆分
//   - 无括号"第1集："拆分（P1-22 宽松正则）
//   - 单集剧本（无标题行整体作为单集）
//   - 空剧本返回 0 集
import { describe, it, expect } from 'vitest';
import { splitScriptToEpisodes } from '../scriptRewriter';

describe('splitScriptToEpisodes', () => {
  it('标准【第X集】拆分', () => {
    const script = ['【第1集】初入江湖', '第一行内容', '', '【第2集】风云再起', '第二行内容'].join('\n');
    const eps = splitScriptToEpisodes(script);

    expect(eps).toHaveLength(2);
    expect(eps[0].title).toBe('【第1集】初入江湖');
    expect(eps[0].content).toContain('第一行内容');
    expect(eps[1].title).toBe('【第2集】风云再起');
    expect(eps[1].content).toContain('第二行内容');
  });

  it('半角括号 [第X集] 拆分', () => {
    const script = ['[第1集] 初入江湖', '第一行内容', '[第2集] 风云再起', '第二行内容'].join('\n');
    const eps = splitScriptToEpisodes(script);

    expect(eps).toHaveLength(2);
    expect(eps[0].title).toBe('[第1集] 初入江湖');
    expect(eps[1].title).toBe('[第2集] 风云再起');
  });

  it('无括号"第X集："拆分', () => {
    const script = ['第1集：初入江湖', '第一行内容', '第2集：风云再起', '第二行内容'].join('\n');
    const eps = splitScriptToEpisodes(script);

    expect(eps).toHaveLength(2);
    expect(eps[0].title).toBe('第1集：初入江湖');
    expect(eps[0].content).toContain('第一行内容');
    expect(eps[1].title).toBe('第2集：风云再起');
    expect(eps[1].content).toContain('第二行内容');
  });

  it('EPISODE X 拆分', () => {
    const script = ['EPISODE 1: The Beginning', 'first line', 'Episode 2: The Storm', 'second line'].join('\n');
    const eps = splitScriptToEpisodes(script);

    expect(eps).toHaveLength(2);
    expect(eps[0].title).toBe('EPISODE 1: The Beginning');
    expect(eps[1].title).toBe('Episode 2: The Storm');
  });

  it('单集剧本（无标题行）整体作为单集', () => {
    const script = ['只有一集的故事内容', '第二行'].join('\n');
    const eps = splitScriptToEpisodes(script);

    expect(eps).toHaveLength(1);
    expect(eps[0].title).toBe('第1集');
    expect(eps[0].content).toContain('只有一集的故事内容');
    expect(eps[0].content).toContain('第二行');
  });

  it('空剧本返回 0 集', () => {
    expect(splitScriptToEpisodes('')).toHaveLength(0);
    expect(splitScriptToEpisodes('   \n  ')).toHaveLength(0);
  });
});
