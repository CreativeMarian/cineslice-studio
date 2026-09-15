// 阶段质量门检查器
// 把 shuohao-skills（Apache-2.0）的确定性质量门规则移植为吃 MOO 表数据的 TS 检查。
// 说明：skill 的 validate 脚本只吃它自己的 JSON schema（outline/cast/art/script/storyboard），
// 与 MOO 的数据模型（一镜一行/自由文本剧本）不兼容，无法直接转换调用，故移植其规则要点：
//   novel-script   台词语速 4.5 字/秒、单句台词装得下镜头时长
//   novel-storyboard 同框 ≤3 人、镜头时长节奏、镜头顺序连续
//   novel-outline  主场景上限 5–15
//   novel-characters 视觉描述完整、同批角色区分、概念图提示词禁其他角色名
// 检查结果只读、不阻断流水线；stageProgress 记录 summary 供前端展示。

import type { Database } from '../../types';
import { ShotDAO, ScriptCharacterDAO, ScriptSceneDAO } from '../../models';
import { parseCharactersInShot } from '../../models/shot';

export interface GateIssue {
  /** 对应 shuohao 质量门来源（如 novel-storyboard 同框门） */
  rule: string;
  message: string;
  severity: 'error' | 'warn';
}

export interface GateResult {
  stage: 'shots' | 'characters' | 'scenes';
  passed: boolean;
  issues: GateIssue[];
  summary: string;
}

// ── 门参数（对齐 shuohao 默认值）──
const CHARS_PER_SECOND = 4.5;       // novel-script：台词按 4.5 字/秒折算
const FIXED_SHOT_SECONDS = 5;       // 项目硬约束：镜头固定 5 秒
const MAX_ON_SCREEN = 3;            // novel-storyboard：同框 ≤3 人（超了必须拆解）
const MAX_SCENES = 15;              // novel-outline：主场景上限（60 集 → 10，宽松 15）
const MIN_DESC_LEN = 20;            // 角色/场景描述最短有效长度（字符）

/** 统计中文字符数 */
function cjkLen(text: string): number {
  if (!text) return 0;
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length;
}

/** 台词折算秒数（novel-script 规则：语速 4.5 字/秒） */
function dialogueSeconds(dialogue: string): number {
  return cjkLen(dialogue) / CHARS_PER_SECOND;
}

// ═══════════════════════════════════════════════════════════
// shots 门（novel-storyboard）
// ═══════════════════════════════════════════════════════════
export function runShotGates(db: Database, episodeId: string): GateResult {
  const issues: GateIssue[] = [];
  const shots = ShotDAO.listByEpisode(db, episodeId);

  if (shots.length === 0) {
    return { stage: 'shots', passed: false, issues: [{ rule: 'shots', message: '无镜头数据', severity: 'error' }], summary: 'shots: 无镜头数据' };
  }

  // 1. 镜头时长节奏（novel-storyboard：每切 2–5 秒；项目固定 5 秒 ±0.5）
  for (const s of shots) {
    const dur = s.duration_seconds || FIXED_SHOT_SECONDS;
    if (Math.abs(dur - FIXED_SHOT_SECONDS) > 0.5) {
      issues.push({
        rule: 'novel-storyboard 镜头时长',
        message: `第 ${s.shot_number} 镜时长 ${dur}s，偏离固定 5s`,
        severity: 'warn',
      });
    }
  }

  // 2. 台词装得下镜头（novel-script 台词秒数 ≤ 分镜秒数）
  for (const s of shots) {
    const dlg = s.dialogue || '';
    if (!dlg.trim()) continue;
    const need = dialogueSeconds(dlg);
    const have = (s.duration_seconds || FIXED_SHOT_SECONDS) + 0.5; // 0.5s 缓冲
    if (need > have) {
      issues.push({
        rule: 'novel-script 台词装得下',
        message: `第 ${s.shot_number} 镜台词约 ${need.toFixed(1)}s，超过镜头 ${have.toFixed(1)}s（含缓冲），会念不完`,
        severity: 'error',
      });
    }
  }

  // 3. 同框 ≤3 人（novel-storyboard maxOnScreen，超了必须拆解）
  for (const s of shots) {
    const chars = parseCharactersInShot(s.characters_in_shot);
    if (chars.length > MAX_ON_SCREEN) {
      issues.push({
        rule: 'novel-storyboard 同框上限',
        message: `第 ${s.shot_number} 镜同框 ${chars.length} 人（${chars.join('、')}），超过上限 ${MAX_ON_SCREEN}，需拆解或注明`,
        severity: 'error',
      });
    }
  }

  // 4. 镜头顺序连续（storyboard 段号连号同理）
  const nums = shots.map((s) => s.shot_number);
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) {
      issues.push({
        rule: 'novel-storyboard 顺序连续',
        message: `镜头序号不连续：期望第 ${i + 1} 个为 ${i + 1}，实际 ${nums[i]}`,
        severity: 'error',
      });
      break;
    }
  }

  // 5. 每镜有动作描述（novel-script 每场至少一个动作节拍 → 镜头不能空）
  for (const s of shots) {
    if (!(s.action_description || '').trim()) {
      issues.push({
        rule: 'novel-script 动作节拍',
        message: `第 ${s.shot_number} 镜无动作描述`,
        severity: 'warn',
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    stage: 'shots',
    passed: errors.length === 0,
    issues,
    summary: `shots 质量门：${shots.length} 镜，${errors.length} 错误 / ${issues.length - errors.length} 警告${errors.length ? '（' + errors[0].message + '）' : ''}`,
  };
}

// ═══════════════════════════════════════════════════════════
// characters 门（novel-characters）
// ═══════════════════════════════════════════════════════════
export function runCharacterGates(db: Database, episodeId: string): GateResult {
  const issues: GateIssue[] = [];
  const chars = ScriptCharacterDAO.listByEpisode(db, episodeId);

  if (chars.length === 0) {
    return { stage: 'characters', passed: false, issues: [{ rule: 'characters', message: '无角色数据', severity: 'error' }], summary: 'characters: 无角色数据' };
  }

  // 1. 视觉描述完整（novel-characters：出图提示词必须能交代长相）
  for (const c of chars) {
    const desc = (c.visual_description || c.description || '').trim();
    if (cjkLen(desc) < MIN_DESC_LEN) {
      issues.push({
        rule: 'novel-characters 视觉描述',
        message: `角色「${c.name}」视觉描述过短（${cjkLen(desc)} 字），出图会缺长相细节`,
        severity: 'warn',
      });
    }
  }

  // 2. 同名角色（角色表必须能区分）
  const seen = new Map<string, number>();
  for (const c of chars) {
    const n = (c.name || '').trim();
    seen.set(n, (seen.get(n) || 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      issues.push({
        rule: 'novel-characters 角色唯一',
        message: `角色名「${name}」出现 ${count} 次，下游无法区分`,
        severity: 'error',
      });
    }
  }

  // 3. 概念图提示词禁其他角色名（novel-characters：图像模型会画成它记忆里的角色）
  const names = chars.map((c) => (c.name || '').trim()).filter(Boolean);
  for (const c of chars) {
    let prompts: string[] = [];
    try {
      const parsed = JSON.parse(c.concept_images || '[]');
      if (Array.isArray(parsed)) prompts = parsed.map((p: any) => p.prompt || '').filter(Boolean);
    } catch { /* 非 JSON 忽略 */ }
    for (const p of prompts) {
      const bad = names.filter((n) => n && n !== c.name && p.includes(n));
      if (bad.length > 0) {
        issues.push({
          rule: 'novel-characters 提示词禁人名',
          message: `角色「${c.name}」概念图提示词包含其他角色名（${bad.join('、')}），会被画成别人`,
          severity: 'warn',
        });
        break;
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    stage: 'characters',
    passed: errors.length === 0,
    issues,
    summary: `characters 质量门：${chars.length} 角色，${errors.length} 错误 / ${issues.length - errors.length} 警告${errors.length ? '（' + errors[0].message + '）' : ''}`,
  };
}

// ═══════════════════════════════════════════════════════════
// scenes 门（novel-art / novel-outline）
// ═══════════════════════════════════════════════════════════
export function runSceneGates(db: Database, episodeId: string): GateResult {
  const issues: GateIssue[] = [];
  const scenes = ScriptSceneDAO.listByEpisode(db, episodeId);

  if (scenes.length === 0) {
    return { stage: 'scenes', passed: false, issues: [{ rule: 'scenes', message: '无场景数据', severity: 'error' }], summary: 'scenes: 无场景数据' };
  }

  // 1. 场景数量上限（novel-outline 主场景上限 5–15）
  if (scenes.length > MAX_SCENES) {
    issues.push({
      rule: 'novel-outline 主场景上限',
      message: `场景数 ${scenes.length} 超过上限 ${MAX_SCENES}，跨集一致性维护成本过高`,
      severity: 'warn',
    });
  }

  // 2. 场景描述完整（novel-art：锚点要可画可认可核对）
  for (const s of scenes) {
    const desc = (s.description || '').trim();
    if (cjkLen(desc) < MIN_DESC_LEN) {
      issues.push({
        rule: 'novel-art 场景描述',
        message: `场景「${s.name}」描述过短（${cjkLen(desc)} 字），缺一致性锚点`,
        severity: 'warn',
      });
    }
  }

  // 3. 场景重名（资产必须唯一可引用）
  const seen = new Map<string, number>();
  for (const s of scenes) {
    const n = (s.name || '').trim();
    seen.set(n, (seen.get(n) || 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      issues.push({
        rule: 'novel-art 场景唯一',
        message: `场景名「${name}」出现 ${count} 次，参考图会互相污染`,
        severity: 'error',
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    stage: 'scenes',
    passed: errors.length === 0,
    issues,
    summary: `scenes 质量门：${scenes.length} 场景，${errors.length} 错误 / ${issues.length - errors.length} 警告${errors.length ? '（' + errors[0].message + '）' : ''}`,
  };
}

/** 统一入口：某阶段生成后调用，返回检查结果（只读，不阻断） */
export function runStageGates(db: Database, stage: 'shots' | 'characters' | 'scenes', episodeId: string): GateResult {
  if (stage === 'shots') return runShotGates(db, episodeId);
  if (stage === 'characters') return runCharacterGates(db, episodeId);
  return runSceneGates(db, episodeId);
}
