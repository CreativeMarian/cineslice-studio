// 提示词 Skill 注册表与加载器
// 每个视频/图像模型一个 PromptSkill（官方提示词规范+模板）。
// 加载时机：剧本解析后、生成分镜和提取资产前，按用户预选的视频模型加载对应 Skill，
// 将官方规范注入分镜/关键帧/视频/资产各阶段的提示词构造。

import type { PromptSkill } from './types';
import { minimaxH3PromptSkill } from './minimax-h3';

// ═══ 注册表：按模型追加（每个模型一个 skill）═══
const skills: PromptSkill[] = [
  minimaxH3PromptSkill,
  // 后续模型追加示例：
  // klingPromptSkill,        // 可灵
  // jimengPromptSkill,       // 即梦
  // seedancePromptSkill,     // 豆包即梦 Seedance
  // wanPromptSkill,          // 通义万相
];

/** 全部已注册 skill */
export function listPromptSkills(): PromptSkill[] {
  return skills.map((s) => ({ ...s }));
}

/**
 * 按 provider + modelName 匹配提示词 Skill（模糊匹配，不区分大小写）。
 * 匹配优先级：provider 命中 → modelKeys 包含 modelName 关键字 → 返回；
 * 若无精确命中，退化为 modelName 关键字匹配。
 */
export function getPromptSkill(provider?: string | null, modelName?: string | null): PromptSkill | undefined {
  if (!modelName && !provider) return undefined;

  const p = (provider || '').toLowerCase();
  const m = (modelName || '').toLowerCase();

  // 第一优先：provider 与 modelName 都命中
  let hit = skills.find(
    (s) =>
      s.providers.some((pr) => p.includes(pr) || pr.includes(p)) &&
      s.modelKeys.some((k) => m.includes(k) || k.includes(m))
  );
  if (hit) return hit;

  // 第二优先：仅 modelName 命中
  hit = skills.find((s) => s.modelKeys.some((k) => m.includes(k) || k.includes(m)));
  if (hit) return hit;

  // 第三优先：仅 provider 命中（如 comfyui 但 modelName 是工作流文件名）
  hit = skills.find((s) => s.providers.some((pr) => p.includes(pr) || pr.includes(p)));
  return hit;
}

/**
 * 从"用户预选视频模型"字符串解析并加载 Skill。
 * 支持格式："provider:modelName"（偏好设置）、"provider/modelName"（video_model_used）。
 */
export function getPromptSkillForVideoModel(videoModelUsed?: string | null): PromptSkill | undefined {
  if (!videoModelUsed) return undefined;
  const trimmed = videoModelUsed.trim();
  if (!trimmed) return undefined;

  const sep = trimmed.includes(':') ? ':' : trimmed.includes('/') ? '/' : null;
  if (sep) {
    const idx = trimmed.indexOf(sep);
    const provider = trimmed.substring(0, idx);
    const model = trimmed.substring(idx + 1);
    return getPromptSkill(provider, model);
  }
  return getPromptSkill(undefined, trimmed);
}

/** 将 skill 的规则段落追加到已有 systemPrompt（去重：同一 skill 只注入一次） */
export function applySkillRules(
  systemPrompt: string,
  skill: PromptSkill | undefined,
  ruleKey: 'shotRule' | 'assetRule' | 'keyframeRule' | 'videoRule'
): string {
  if (!skill) return systemPrompt;
  const rule = skill[ruleKey];
  if (!rule) return systemPrompt;
  // 已注入过则跳过
  if (systemPrompt.includes(`【${skill.displayName}`) || systemPrompt.includes(skill.id)) {
    return systemPrompt;
  }
  return `${systemPrompt}\n\n${rule}`;
}

/** 查询某模型是否有提示词 Skill（供前端展示徽标） */
export function hasPromptSkill(provider?: string | null, modelName?: string | null): boolean {
  return getPromptSkill(provider, modelName) !== undefined;
}
