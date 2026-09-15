// 提示词 Skill 注册表与加载器
// 每个视频/图像模型一个 PromptSkill（官方提示词规范+模板）。
// 加载时机：剧本解析后、生成分镜和提取资产前，按用户预选的视频模型加载对应 Skill，
// 将官方规范注入分镜/关键帧/视频/资产各阶段的提示词构造。
// 兜底：任何未配置专属官方 Skill 的视频模型自动使用 generic-video（通用官方规范），
// 保证"换模型自动适配"——脚本始终按当前模型的官方提示词规范生成。

import type { PromptSkill } from './types';
import { minimaxH3PromptSkill } from './minimax-h3';
import { klingPromptSkill } from './kling';
import { seedance25PromptSkill, seedance20PromptSkill } from './seedance';
import { genericVideoPromptSkill } from './generic-video';

// ═══ 注册表：按模型追加（每个模型一个 skill）═══
// 注意：模型名可能同时命中多个 skill 的 modelKeys（如 seedance-2-5-pro 同时包含
// 'seedance-2' 与 'seedance-2-5'），getPromptSkill 按"modelKey 匹配长度最长优先"消歧。
const skills: PromptSkill[] = [
  minimaxH3PromptSkill,       // MiniMax H3（含本地 ComfyUI 首尾帧 flf2v / 云端 H3 / 海螺 Hailuo3）
  klingPromptSkill,           // 可灵 Kling
  seedance25PromptSkill,      // Seedance 2.5（即梦 Dreamina 四段公式）
  seedance20PromptSkill,      // Seedance 2.0 / 1.x（火山方舟八段骨架）
  // 后续模型追加示例：
  // wanPromptSkill,            // 通义万相
  // runwayPromptSkill,         // Runway
  // pikaPromptSkill,           // Pika
];

/** 全部已注册 skill（不含兜底） */
export function listPromptSkills(): PromptSkill[] {
  return skills.map((s) => ({ ...s }));
}

/** 计算 modelName 命中 skill 的 modelKey 匹配长度（用于最长匹配消歧） */
function matchKeyLength(modelName: string, s: PromptSkill): number {
  let best = 0;
  for (const k of s.modelKeys) {
    const hit = modelName.includes(k) || k.includes(modelName);
    if (hit) best = Math.max(best, Math.min(k.length, modelName.length));
  }
  return best;
}

/**
 * 按 provider + modelName 匹配提示词 Skill（模糊匹配，不区分大小写）。
 * 匹配优先级：
 *   1. provider 与 modelName 都命中，取 modelKey 匹配最长的（如 seedance-2-5-pro → 2.5 而非 2.0）；
 *   2. 仅 modelName 命中（同样最长优先）；
 *   3. 仅 provider 命中（如 comfyui 但 modelName 是工作流文件名）；
 *   4. 兜底 generic-video 通用规范（任何模型都有适配）。
 */
export function getPromptSkill(provider?: string | null, modelName?: string | null): PromptSkill {
  if (!modelName && !provider) return genericVideoPromptSkill;

  const p = (provider || '').toLowerCase();
  const m = (modelName || '').toLowerCase();

  // 第一优先：provider 与 modelName 都命中，取最长 key 匹配
  let best: { s: PromptSkill; len: number } | null = null;
  for (const s of skills) {
    const providerHit = s.providers.some((pr) => p.includes(pr) || pr.includes(p));
    if (!providerHit) continue;
    const len = matchKeyLength(m, s);
    if (len > 0 && (!best || len > best.len)) best = { s, len };
  }
  if (best) return best.s;

  // 第二优先：仅 modelName 命中（最长优先）
  best = null;
  for (const s of skills) {
    const len = matchKeyLength(m, s);
    if (len > 0 && (!best || len > best.len)) best = { s, len };
  }
  if (best) return best.s;

  // 第三优先：仅 provider 命中（如 comfyui 但 modelName 是工作流文件名）
  best = null;
  for (const s of skills) {
    const providerHit = s.providers.some((pr) => p.includes(pr) || pr.includes(p));
    if (providerHit && (!best || (s.modelKeys[0]?.length || 0) > (best.s.modelKeys[0]?.length || 0))) best = { s, len: 0 };
  }
  if (best) return best.s;

  // 兜底：通用视频提示词规范
  return genericVideoPromptSkill;
}

/**
 * 从"用户预选视频模型"字符串解析并加载 Skill。
 * 支持格式："provider:modelName"（偏好设置）、"provider/modelName"（video_model_used）。
 * 未命中专属 Skill 时返回通用规范（任何模型都有适配）。
 */
export function getPromptSkillForVideoModel(videoModelUsed?: string | null): PromptSkill {
  if (!videoModelUsed) return genericVideoPromptSkill;
  const trimmed = videoModelUsed.trim();
  if (!trimmed) return genericVideoPromptSkill;

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

/** 查询某模型是否配置了专属提示词 Skill（不含通用兜底，供前端展示专属徽标） */
export function hasPromptSkill(provider?: string | null, modelName?: string | null): boolean {
  if (!modelName && !provider) return false;
  const p = (provider || '').toLowerCase();
  const m = (modelName || '').toLowerCase();
  return skills.some(
    (s) =>
      s.providers.some((pr) => p.includes(pr) || pr.includes(p)) ||
      s.modelKeys.some((k) => m.includes(k) || k.includes(m))
  );
}

/** 获取模型命中的 Skill 展示名（含通用兜底：'通用视频提示词规范'） */
export function getSkillDisplayName(provider?: string | null, modelName?: string | null): string {
  return getPromptSkill(provider, modelName).displayName;
}
