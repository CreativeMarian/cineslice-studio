// P1-4: 角色表情图生成服务（扩展版）
// 三大类共25种表情：
//   1. 基础表情(macro) - 9种：大喜大怒等明显表情
//   2. 微表情(micro) - 8种：细微面部变化，眼神/嘴角/眉头微动
//   3. 心理活动(psychology) - 8种：通过表情肢体传达内心状态
// 特写镜头自动选用对应表情图作为参考，微表情和心理活动优先匹配

import type { Database, ScriptCharacter } from '../types';
import { ScriptCharacterDAO } from '../models';
import { aiProxy } from './aiProxy';
import { standardizeCharacterAnchor } from './projectMemoryService';

export type ExpressionCategory = 'macro' | 'micro' | 'psychology';

// 25种表情定义（三大类）
export const EXPRESSION_TYPES = [
  // ===== 基础表情(macro) - 9种 =====
  { key: 'happy', name: '喜', category: 'macro' as ExpressionCategory, desc: '开心微笑，眼睛弯成月牙，嘴角上扬', emoji: '😊' },
  { key: 'angry', name: '怒', category: 'macro' as ExpressionCategory, desc: '愤怒皱眉，眉头紧锁，眼神锐利，嘴角下压', emoji: '😠' },
  { key: 'sad', name: '哀', category: 'macro' as ExpressionCategory, desc: '悲伤流泪，眼眶泛红，嘴角下垂，眼神黯淡', emoji: '😢' },
  { key: 'surprised', name: '惊', category: 'macro' as ExpressionCategory, desc: '惊讶张嘴，眼睛睁大，眉毛上扬', emoji: '😲' },
  { key: 'fear', name: '恐', category: 'macro' as ExpressionCategory, desc: '恐惧害怕，瞳孔放大，身体微微颤抖，脸色苍白', emoji: '😨' },
  { key: 'thinking', name: '思', category: 'macro' as ExpressionCategory, desc: '沉思思考，手托下巴，眼神专注，眉头微蹙', emoji: '🤔' },
  { key: 'calm', name: '平静', category: 'macro' as ExpressionCategory, desc: '平静自然，表情放松，眼神平和', emoji: '😐' },
  { key: 'smirk', name: '冷笑', category: 'macro' as ExpressionCategory, desc: '冷笑嘲讽，嘴角一侧上扬，眼神轻蔑', emoji: '😏' },
  { key: 'crying', name: '哭泣', category: 'macro' as ExpressionCategory, desc: '大哭流泪，泪流满面，嘴巴张开，表情痛苦', emoji: '😭' },

  // ===== 微表情(micro) - 8种 =====
  { key: 'micro_smile', name: '浅笑', category: 'micro' as ExpressionCategory, desc: '嘴角微微上扬，不明显的笑意，眼神柔和，似笑非笑', emoji: '🙂' },
  { key: 'micro_frown', name: '微蹙', category: 'micro' as ExpressionCategory, desc: '眉头微微皱起，轻微不悦或担忧，眼神凝重，表情克制', emoji: '😟' },
  { key: 'micro_glance', name: '眼神闪烁', category: 'micro' as ExpressionCategory, desc: '眼神游移不定，不敢直视，眼珠频繁转动，透露出心虚或犹豫', emoji: '👀' },
  { key: 'micro_clench', name: '咬唇', category: 'micro' as ExpressionCategory, desc: '嘴唇微微咬紧，下唇轻咬，紧张或克制情绪，眼神躲闪', emoji: '😬' },
  { key: 'micro_nostril', name: '鼻翼微动', category: 'micro' as ExpressionCategory, desc: '鼻孔微微扩张，呼吸加重，压抑的愤怒，眼神冰冷', emoji: '😤' },
  { key: 'micro_eyeroll', name: '眼波流转', category: 'micro' as ExpressionCategory, desc: '眼珠微动，狡黠或思索，眼神带着算计，嘴角似有若无', emoji: '😏' },
  { key: 'micro_tremble', name: '嘴角微颤', category: 'micro' as ExpressionCategory, desc: '嘴角微微颤抖，激动或委屈，眼眶泛红，强忍着情绪', emoji: '🥺' },
  { key: 'micro_blink', name: '频繁眨眼', category: 'micro' as ExpressionCategory, desc: '眨眼频率加快，紧张或不安，眼神飘忽，额头微汗', emoji: '😰' },

  // ===== 心理活动(psychology) - 8种 =====
  { key: 'hesitation', name: '犹豫', category: 'psychology' as ExpressionCategory, desc: '眼神飘忽，嘴唇微张又合上，举棋不定，身体微微前倾又后退', emoji: '🤷' },
  { key: 'tension', name: '紧张', category: 'psychology' as ExpressionCategory, desc: '身体微微僵硬，眼神警惕，呼吸急促，拳头紧握，额头冒汗', emoji: '😰' },
  { key: 'anticipation', name: '期待', category: 'psychology' as ExpressionCategory, desc: '眼睛微亮，嘴角含着抑制不住的笑意，身体前倾，眼神充满渴望', emoji: '🤩' },
  { key: 'restraint', name: '隐忍', category: 'psychology' as ExpressionCategory, desc: '咬紧牙关，眼眶泛红但强忍着不哭，表情克制，双手攥紧', emoji: '😣' },
  { key: 'doubt', name: '怀疑', category: 'psychology' as ExpressionCategory, desc: '眉头微挑，眼神审视，嘴角带着不信任，头微微倾斜，打量对方', emoji: '🤨' },
  { key: 'longing', name: '思念', category: 'psychology' as ExpressionCategory, desc: '眼神悠远，望向远方，表情温柔又落寞，嘴角带着苦涩的微笑', emoji: '🥹' },
  { key: 'determination', name: '决绝', category: 'psychology' as ExpressionCategory, desc: '眼神坚定，嘴角紧抿，带着破釜沉舟的气势，下巴微抬，无所畏惧', emoji: '😠' },
  { key: 'guilt', name: '愧疚', category: 'psychology' as ExpressionCategory, desc: '眼神躲闪，不敢直视，表情自责，微微低头，眼眶湿润，充满歉意', emoji: '😔' },
] as const;

export type ExpressionKey = typeof EXPRESSION_TYPES[number]['key'];

export interface ExpressionImages {
  [key: string]: string; // expressionKey -> imageUrl
}

// 按分类分组
export const EXPRESSION_BY_CATEGORY: Record<ExpressionCategory, typeof EXPRESSION_TYPES[number][]> = {
  macro: EXPRESSION_TYPES.filter(e => e.category === 'macro'),
  micro: EXPRESSION_TYPES.filter(e => e.category === 'micro'),
  psychology: EXPRESSION_TYPES.filter(e => e.category === 'psychology'),
};

export const CATEGORY_LABELS: Record<ExpressionCategory, string> = {
  macro: '基础表情',
  micro: '微表情',
  psychology: '心理活动',
};

/**
 * 为角色生成单张表情图
 */
export async function generateExpressionImage(
  db: Database,
  userId: string,
  projectId: string,
  character: ScriptCharacter,
  expressionKey: ExpressionKey,
  provider: string,
  modelName: string
): Promise<string> {
  const expression = EXPRESSION_TYPES.find(e => e.key === expressionKey);
  if (!expression) throw new Error(`未知表情类型: ${expressionKey}`);

  // 角色视觉锚点
  const anchor = character.anchor_standardized || standardizeCharacterAnchor(character);

  // 角色参考图
  const referenceImages: string[] = [];
  if (character.reference_image_url) referenceImages.push(character.reference_image_url);
  if (character.concept_images) {
    try {
      const imgs = JSON.parse(character.concept_images);
      if (Array.isArray(imgs) && imgs.length > 0) referenceImages.push(imgs[0]);
    } catch { /* ignore */ }
  }

  // 根据表情类别调整提示词
  const categoryNote = expression.category === 'micro'
    ? '【微表情】注意：这是极其细微的面部变化，不要夸张，要自然真实，仿佛不经意间流露。'
    : expression.category === 'psychology'
    ? '【心理活动】注意：表情要传达内心状态，通过眼神和微妙的肢体语言展现心理，不要过于外放。'
    : '【基础表情】表情明确清晰，特征鲜明。';

  // 表情图提示词：特写头像 + 特定表情 + 角色锚点
  const prompt = `角色表情特写图，正面头像，白色背景，${expression.desc}。
${categoryNote}
角色视觉特征：${anchor}。
要求：面部清晰，表情准确细腻，与角色外貌完全一致，专业影视级角色表情参考图，电影级光影。`;

  const negativePrompt = '全身照，身体，多个角色，模糊，变形，多余手指，面部扭曲，换脸，背景复杂，文字，水印，夸张表情，过度表演';

  const result = await aiProxy.generateImage({
    db, userId, projectId,
    provider, modelName,
    prompt,
    negativePrompt,
    count: 1,
    size: '1024x1024',
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    saveSubDir: 'expressions',
  });

  const url = result.images[0]?.url;
  if (!url) throw new Error('表情图生成失败');

  return url;
}

/**
 * 为角色生成全部表情图（25张，按类别分批生成）
 */
export async function generateAllExpressions(
  db: Database,
  userId: string,
  projectId: string,
  characterId: string,
  provider: string,
  modelName: string
): Promise<ExpressionImages> {
  const character = ScriptCharacterDAO.getById(db, characterId);
  if (!character) throw new Error('角色不存在');

  // 更新状态为生成中
  ScriptCharacterDAO.update(db, characterId, { expression_status: 'generating' } as any);

  const results: ExpressionImages = {};

  try {
    for (const expr of EXPRESSION_TYPES) {
      try {
        const url = await generateExpressionImage(
          db, userId, projectId, character, expr.key, provider, modelName
        );
        results[expr.key] = url;
        console.log(`[Expression] ${character.name} - [${CATEGORY_LABELS[expr.category]}]${expr.name}(${expr.key}) 生成完成`);
      } catch (err: any) {
        console.warn(`[Expression] ${character.name} - ${expr.name} 生成失败:`, err.message);
      }
    }

    // 保存到角色
    ScriptCharacterDAO.update(db, characterId, {
      expression_images: JSON.stringify(results),
      expression_status: Object.keys(results).length > 0 ? 'completed' : 'failed',
    } as any);

    return results;
  } catch (err: any) {
    ScriptCharacterDAO.update(db, characterId, { expression_status: 'failed' } as any);
    throw err;
  }
}

/**
 * 根据镜头情绪匹配表情图（优先匹配微表情和心理活动，更细腻）
 * 匹配优先级：心理活动 > 微表情 > 基础表情
 * @param mood 镜头情绪（紧张/愤怒/悲伤/惊讶/犹豫/期待/...）
 * @returns 匹配的表情 key
 */
export function matchExpressionByMood(mood: string): ExpressionKey | null {
  if (!mood) return null;
  const m = mood.toLowerCase();

  // ===== 心理活动优先匹配 =====
  if (m.includes('犹豫') || m.includes('迟疑') || m.includes('举棋不定') || m.includes('纠结')) return 'hesitation';
  if (m.includes('紧张') || m.includes('焦虑') || m.includes('忐忑') || m.includes('慌张')) return 'tension';
  if (m.includes('期待') || m.includes('渴望') || m.includes('盼望') || m.includes('憧憬')) return 'anticipation';
  if (m.includes('隐忍') || m.includes('强忍') || m.includes('克制') || m.includes('压抑')) return 'restraint';
  if (m.includes('怀疑') || m.includes('质疑') || m.includes('不信任') || m.includes('审视')) return 'doubt';
  if (m.includes('思念') || m.includes('想念') || m.includes('怀念') || m.includes('牵挂')) return 'longing';
  if (m.includes('决绝') || m.includes('坚定') || m.includes('破釜沉舟') || m.includes('下定决心')) return 'determination';
  if (m.includes('愧疚') || m.includes('内疚') || m.includes('自责') || m.includes('歉意')) return 'guilt';

  // ===== 微表情匹配 =====
  if (m.includes('浅笑') || m.includes('微微一笑') || m.includes('似笑非笑') || m.includes('抿嘴笑')) return 'micro_smile';
  if (m.includes('微蹙') || m.includes('微皱眉头') || m.includes('不悦') || m.includes('隐隐担忧')) return 'micro_frown';
  if (m.includes('眼神闪烁') || m.includes('眼神游移') || m.includes('不敢直视') || m.includes('心虚')) return 'micro_glance';
  if (m.includes('咬唇') || m.includes('咬嘴唇') || m.includes('紧抿嘴唇')) return 'micro_clench';
  if (m.includes('鼻翼') || m.includes('呼吸加重') || m.includes('压抑愤怒')) return 'micro_nostril';
  if (m.includes('眼波') || m.includes('狡黠') || m.includes('眼珠一转') || m.includes('算计')) return 'micro_eyeroll';
  if (m.includes('嘴角微颤') || m.includes('嘴唇颤抖') || m.includes('委屈')) return 'micro_tremble';
  if (m.includes('频繁眨眼') || m.includes('眨眼') || m.includes('不安')) return 'micro_blink';

  // ===== 基础表情兜底 =====
  if (m.includes('开心') || m.includes('高兴') || m.includes('笑') || m.includes('喜')) return 'happy';
  if (m.includes('愤怒') || m.includes('生气') || m.includes('怒')) return 'angry';
  if (m.includes('悲伤') || m.includes('难过') || m.includes('伤心') || m.includes('哀')) return 'sad';
  if (m.includes('惊讶') || m.includes('吃惊') || m.includes('震惊') || m.includes('惊')) return 'surprised';
  if (m.includes('恐惧') || m.includes('害怕') || m.includes('恐')) return 'fear';
  if (m.includes('思考') || m.includes('沉思') || m.includes('思')) return 'thinking';
  if (m.includes('平静') || m.includes('自然')) return 'calm';
  if (m.includes('冷笑') || m.includes('嘲讽') || m.includes('轻蔑')) return 'smirk';
  if (m.includes('哭泣') || m.includes('大哭') || m.includes('哭')) return 'crying';

  return null;
}

/**
 * 获取角色的表情图（如果已生成）
 */
export function getCharacterExpressions(character: ScriptCharacter): ExpressionImages | null {
  if (!character.expression_images) return null;
  try {
    return JSON.parse(character.expression_images);
  } catch {
    return null;
  }
}

export const characterExpressionService = {
  EXPRESSION_TYPES,
  EXPRESSION_BY_CATEGORY,
  CATEGORY_LABELS,
  generateExpressionImage,
  generateAllExpressions,
  matchExpressionByMood,
  getCharacterExpressions,
};
