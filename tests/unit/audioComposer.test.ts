import { describe, it, expect } from 'vitest';
import { recommendSfx, BGM_PRESETS } from '../../server/src/services/audioComposer';

describe('audioComposer - recommendSfx', () => {
  it('匹配打斗关键词返回打斗声', () => {
    const result = recommendSfx('他一拳打向对方，两人激烈打斗');
    expect(result).toContain('打斗声');
  });

  it('匹配跑步关键词返回脚步声', () => {
    const result = recommendSfx('她在走廊里快速奔跑，追逐前方的人影');
    expect(result).toContain('脚步声');
  });

  it('匹配门关键词返回开门声', () => {
    const result = recommendSfx('他推开 door 走了进去');
    expect(result).toContain('开门声');
  });

  it('匹配雨关键词返回雨声', () => {
    const result = recommendSfx('窗外下着大雨，rain 敲打玻璃');
    expect(result).toContain('雨声');
  });

  it('匹配爆炸关键词返回爆炸声', () => {
    const result = recommendSfx('远处传来 explosion，火光冲天');
    expect(result).toContain('爆炸声');
  });

  it('匹配枪关键词返回枪声', () => {
    const result = recommendSfx('他举起 gun，扣动扳机');
    expect(result).toContain('枪声');
  });

  it('匹配哭关键词返回哭泣声', () => {
    const result = recommendSfx('她忍不住 cry 了起来');
    expect(result).toContain('哭泣声');
  });

  it('匹配笑关键词返回笑声', () => {
    const result = recommendSfx('大家都 laugh 了起来');
    expect(result).toContain('笑声');
  });

  it('无匹配关键词时返回环境音作为兜底', () => {
    const result = recommendSfx('他静静地坐在那里思考问题');
    expect(result).toContain('环境音');
    expect(result).toHaveLength(1);
  });

  it('多个关键词匹配时返回多个音效', () => {
    const result = recommendSfx('打斗中传来枪声和爆炸声');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result).toContain('打斗声');
    expect(result).toContain('枪声');
    expect(result).toContain('爆炸声');
  });

  it('空字符串返回环境音', () => {
    const result = recommendSfx('');
    expect(result).toEqual(['环境音']);
  });
});

describe('audioComposer - BGM_PRESETS', () => {
  it('包含4种预设', () => {
    expect(Object.keys(BGM_PRESETS)).toHaveLength(4);
  });

  it('每种预设包含 name, volume, fadeIn, fadeOut', () => {
    for (const key of Object.keys(BGM_PRESETS)) {
      const preset = (BGM_PRESETS as any)[key];
      expect(preset.name).toBeDefined();
      expect(typeof preset.volume).toBe('number');
      expect(preset.volume).toBeGreaterThan(0);
      expect(preset.volume).toBeLessThanOrEqual(1);
      expect(typeof preset.fadeIn).toBe('number');
      expect(typeof preset.fadeOut).toBe('number');
      expect(preset.fadeOut).toBeGreaterThan(0);
    }
  });

  it('紧张预设音量为0.25', () => {
    expect(BGM_PRESETS.tense.volume).toBe(0.25);
    expect(BGM_PRESETS.tense.name).toBe('紧张');
  });

  it('抒情预设 fadeOut 为3秒（最长）', () => {
    expect(BGM_PRESETS.emotional.fadeOut).toBe(3);
  });
});
