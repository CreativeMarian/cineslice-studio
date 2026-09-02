import { describe, it, expect } from 'vitest';
import { inferScenarios, type ModelMeta } from '../../src/types/model';

const baseMeta: ModelMeta = {
  provider: 'test',
  providerName: 'Test',
  modelName: 'test-model',
  displayName: 'Test Model',
  modelType: 'text',
  description: '测试模型',
  supports: {},
};

describe('inferScenarios', () => {
  it('已有 scenarios 时直接返回', () => {
    const meta = { ...baseMeta, scenarios: ['自定义场景'] };
    expect(inferScenarios(meta)).toEqual(['自定义场景']);
  });

  it('空 scenarios 时走推断逻辑', () => {
    const meta = { ...baseMeta, scenarios: [] };
    const result = inferScenarios(meta);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('模型名含 reasoner 时推断复杂推理', () => {
    const meta = { ...baseMeta, modelName: 'deepseek-reasoner' };
    expect(inferScenarios(meta)).toContain('复杂推理');
  });

  it('模型名含 o1 时推断复杂推理', () => {
    const meta = { ...baseMeta, modelName: 'o1-preview' };
    expect(inferScenarios(meta)).toContain('复杂推理');
  });

  it('描述含深度思考时推断复杂推理', () => {
    const meta = { ...baseMeta, modelName: 'x', description: '支持深度思考' };
    expect(inferScenarios(meta)).toContain('复杂推理');
  });

  it('模型名含 vision 时推断图片理解', () => {
    const meta = { ...baseMeta, modelName: 'doubao-vision-pro' };
    expect(inferScenarios(meta)).toContain('图片理解');
  });

  it('描述含多模态时推断图片理解', () => {
    const meta = { ...baseMeta, modelName: 'x', description: '多模态理解模型' };
    expect(inferScenarios(meta)).toContain('图片理解');
  });

  it('模型名含 256k 时推断长文本分析', () => {
    const meta = { ...baseMeta, modelName: 'doubao-1-5-pro-256k' };
    expect(inferScenarios(meta)).toContain('长文本分析');
  });

  it('模型名含 long 时推断长文本分析', () => {
    const meta = { ...baseMeta, modelName: 'qwen-long' };
    expect(inferScenarios(meta)).toContain('长文本分析');
  });

  it('模型名含 lite 时推断高并发和低成本', () => {
    const meta = { ...baseMeta, modelName: 'doubao-lite' };
    const result = inferScenarios(meta);
    expect(result).toContain('高并发');
    expect(result).toContain('低成本');
  });

  it('模型名含 mini 时推断高并发和低成本', () => {
    const meta = { ...baseMeta, modelName: 'gpt-4o-mini' };
    const result = inferScenarios(meta);
    expect(result).toContain('高并发');
    expect(result).toContain('低成本');
  });

  it('模型名含 flash 时推断高并发和低成本', () => {
    const meta = { ...baseMeta, modelName: 'gemini-1.5-flash' };
    const result = inferScenarios(meta);
    expect(result).toContain('高并发');
    expect(result).toContain('低成本');
  });

  it('模型名含 pro 且不含 lite/mini 时推断剧本创作', () => {
    const meta = { ...baseMeta, modelName: 'doubao-pro' };
    expect(inferScenarios(meta)).toContain('剧本创作');
  });

  it('模型名含 pro 但也含 lite 时不推断剧本创作', () => {
    const meta = { ...baseMeta, modelName: 'doubao-pro-lite' };
    expect(inferScenarios(meta)).not.toContain('剧本创作');
  });

  it('描述含旗舰时推断剧本创作', () => {
    const meta = { ...baseMeta, modelName: 'x', description: '旗舰级模型' };
    expect(inferScenarios(meta)).toContain('剧本创作');
  });

  it('无任何特征时返回通用对话和内容生成', () => {
    const meta = { ...baseMeta, modelName: 'unknown-model', description: '一个普通模型' };
    const result = inferScenarios(meta);
    expect(result).toContain('通用对话');
    expect(result).toContain('内容生成');
  });

  it('最多返回 3 个场景', () => {
    const meta = {
      ...baseMeta,
      modelName: 'o1-pro-code-256k',
      description: '旗舰级编程模型，支持深度思考和多模态',
    };
    const result = inferScenarios(meta);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
