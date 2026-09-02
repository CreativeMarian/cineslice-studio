import {
  getVideoNegativePrompt,
  getVideoPositivePrompt,
  getVideoConsistencyPrompt,
  getVideoQualityPrompt,
  enhanceVideoPrompt,
} from '../server/src/services/prompts/videoQuality';

// 统计负面词数量
const neg = getVideoNegativePrompt();
const negCount = neg.split(',').length;
console.log(`负面提示词总数: ${negCount} 条`);

const negFight = getVideoNegativePrompt('fight');
const negFightCount = negFight.split(',').length;
console.log(`打斗场景负面词总数: ${negFightCount} 条`);

// 分场景正面词
console.log('\n--- 分场景正面词 ---');
for (const scene of ['fight', 'dialogue', 'emotional', 'action', 'environment'] as const) {
  const pos = getVideoPositivePrompt(scene);
  console.log(`[${scene}] 长度: ${pos.length} 字符`);
}

// 一致性提示词
console.log('\n--- 一致性提示词 ---');
const cons = getVideoConsistencyPrompt(
  [{ name: '林澈', appearance: '灰色杂役长袍，清瘦身形，眉眼干净' }],
  { location: '青云宗杂役院', timeOfDay: '黄昏', atmosphere: '压抑绝望', props: ['长鞭', '灵石'] }
);
console.log(cons);

// enhanceVideoPrompt 兼容测试
console.log('\n--- enhanceVideoPrompt 兼容测试 ---');
const result = enhanceVideoPrompt('林澈挥鞭打人', { isActionScene: true });
console.log(`正向提示词长度: ${result.prompt.length}`);
console.log(`负面提示词长度: ${result.negativePrompt.length}`);

const result2 = enhanceVideoPrompt('两人对话', { sceneType: 'dialogue' });
console.log(`对话场景正向长度: ${result2.prompt.length}`);

console.log('\ngetVideoQualityPrompt 长度:', getVideoQualityPrompt().length);
console.log('\n✅ 所有导出函数正常工作');
