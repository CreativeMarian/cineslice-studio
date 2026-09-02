import { describe, it, expect } from 'vitest';
import { resolveModelName } from '../../server/src/services/modelUtils';

describe('resolveModelName', () => {
  it('config 为空时返回默认模型名', () => {
    expect(resolveModelName({}, 'doubao-pro')).toBe('doubao-pro');
    expect(resolveModelName({ config: null }, 'doubao-pro')).toBe('doubao-pro');
    expect(resolveModelName({ config: '' }, 'doubao-pro')).toBe('doubao-pro');
  });

  it('config 含 modelOverride 时返回覆盖值', () => {
    const config = { config: JSON.stringify({ modelOverride: 'ep-20240816xxxx' }) };
    expect(resolveModelName(config, 'doubao-pro')).toBe('ep-20240816xxxx');
  });

  it('config 含 modelOverride 但为空字符串时返回默认值', () => {
    const config = { config: JSON.stringify({ modelOverride: '' }) };
    expect(resolveModelName(config, 'doubao-pro')).toBe('doubao-pro');
  });

  it('config 不含 modelOverride 时返回默认值', () => {
    const config = { config: JSON.stringify({ otherField: 'value' }) };
    expect(resolveModelName(config, 'doubao-pro')).toBe('doubao-pro');
  });

  it('config 不是有效 JSON 时返回默认值（不抛异常）', () => {
    const config = { config: 'not-valid-json{{{' };
    expect(resolveModelName(config, 'doubao-pro')).toBe('doubao-pro');
  });

  it('config.modelOverride 不是字符串时返回默认值', () => {
    const config = { config: JSON.stringify({ modelOverride: 123 }) };
    expect(resolveModelName(config, 'doubao-pro')).toBe('doubao-pro');
  });

  it('支持不同厂商的模型名覆盖', () => {
    const config = { config: JSON.stringify({ modelOverride: 'custom-deepseek-v2' }) };
    expect(resolveModelName(config, 'deepseek-chat')).toBe('custom-deepseek-v2');
  });
});
