// P0-1: 项目级长期记忆服务
// 借鉴 ManjuForge 三文件思路：角色圣经 / 世界观 / 剧情摘要 + 伏笔追踪 + 角色关系图谱
// 核心功能：
// 1) generateCharacterBible - 生成角色圣经（跨剧集角色视觉锚点汇总）
// 2) generateWorldSetting - 生成世界观设定
// 3) updateStorySummary - 每集完成后更新剧情摘要
// 4) detectForeshadows - AI识别剧本伏笔
// 5) updateRelationships - 更新角色关系图谱
// 6) buildMemoryInjection - 生成前把记忆注入到系统提示词
// 7) standardizeCharacterAnchor - 角色视觉锚点标准化（100字内）

import type { Database, ScriptCharacter, ScriptScene, ProjectBible, StoryForeshadow } from '../types';
import {
  ProjectBibleDAO,
  StoryForeshadowDAO,
  CharacterRelationshipDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  NovelEpisodeDAO,
  ShotDAO,
} from '../models';

// ═══════════════════════════════════════════════════════════════
// 角色视觉锚点标准化
// ═══════════════════════════════════════════════════════════════

/**
 * 从角色的 visual_description 和结构化字段生成100字内标准化锚点
 * 锚点格式：性别年龄+脸型+瞳色+发型发色+服装+配饰+体型+标志性特征
 */
export function standardizeCharacterAnchor(character: ScriptCharacter): string {
  const parts: string[] = [];

  // 性别年龄
  const gender = character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '';
  const age = character.anchor_face_shape ? '' : (character.age || '');
  if (gender || age) parts.push(`${age}${gender}`.trim());

  // 脸型
  if (character.anchor_face_shape) parts.push(character.anchor_face_shape);

  // 瞳色
  if (character.anchor_eye_color) parts.push(`${character.anchor_eye_color}眼睛`);

  // 发型发色
  const hair = [character.anchor_hair_color, character.anchor_hairstyle].filter(Boolean).join('');
  if (hair) parts.push(hair);

  // 服装
  if (character.anchor_outfit) parts.push(`穿${character.anchor_outfit}`);

  // 配饰
  if (character.anchor_accessories) parts.push(`戴${character.anchor_accessories}`);

  // 体型
  if (character.anchor_body_type) parts.push(character.anchor_body_type);

  // 标志性特征
  if (character.anchor_distinctive) parts.push(character.anchor_distinctive);

  // 如果结构化字段为空，从 visual_description 提取（简单截断）
  if (parts.length === 0 && character.visual_description) {
    const desc = character.visual_description.replace(/[\n\r]/g, ' ').trim();
    return desc.length > 100 ? desc.slice(0, 100) + '...' : desc;
  }

  const anchor = parts.join('，');
  return anchor.length > 100 ? anchor.slice(0, 100) + '...' : anchor;
}

/**
 * 为角色生成结构化锚点字段（AI辅助）
 * 如果已有结构化字段则跳过，否则用AI从visual_description提取
 */
export async function generateCharacterAnchors(
  db: Database,
  userId: string,
  projectId: string,
  episodeId: string
): Promise<number> {
  const characters = ScriptCharacterDAO.listByEpisode(db, episodeId);
  let updated = 0;

  for (const char of characters) {
    // 已有标准化锚点则跳过
    if (char.anchor_standardized && char.anchor_standardized.length > 10) continue;

    // 从 visual_description 生成标准化锚点
    const anchor = standardizeCharacterAnchor(char);
    if (anchor && anchor.length > 5) {
      ScriptCharacterDAO.update(db, char.id, { anchor_standardized: anchor });
      updated++;
    }
  }

  return updated;
}

// ═══════════════════════════════════════════════════════════════
// 角色圣经生成
// ═══════════════════════════════════════════════════════════════

/**
 * 生成项目角色圣经（跨剧集所有角色的视觉锚点汇总）
 * 格式：Markdown，每个角色一个条目，包含标准化锚点+性格+关系
 */
export async function generateCharacterBible(
  db: Database,
  userId: string,
  projectId: string
): Promise<ProjectBible> {
  const episodes = NovelEpisodeDAO.listByProject(db, projectId);
  const allCharacters: Map<string, ScriptCharacter> = new Map();

  // 收集所有剧集的角色（同名角色合并，取最新）
  for (const ep of episodes) {
    const chars = ScriptCharacterDAO.listByEpisode(db, ep.id);
    for (const c of chars) {
      const existing = allCharacters.get(c.name);
      if (!existing || new Date(c.updated_at) > new Date(existing.updated_at)) {
        allCharacters.set(c.name, c);
      }
    }
  }

  // 生成角色关系
  const relationships = CharacterRelationshipDAO.listByProject(db, projectId);

  // 构建 Markdown
  let md = '# 角色圣经\n\n';
  md += `> 自动生成于 ${new Date().toLocaleString('zh-CN')}，共 ${allCharacters.size} 个角色\n\n`;

  for (const [name, char] of allCharacters) {
    const anchor = char.anchor_standardized || standardizeCharacterAnchor(char);
    md += `## ${name}\n\n`;
    md += `- **视觉锚点**：${anchor || '待生成'}\n`;
    md += `- **性别**：${char.gender}\n`;
    md += `- **角色类型**：${char.role_type}\n`;
    if (char.personality) md += `- **性格**：${char.personality}\n`;
    if (char.description) md += `- **描述**：${char.description}\n`;

    // 该角色的关系
    const charRels = relationships.filter(r => r.char_a_id === char.id || r.char_b_id === char.id);
    if (charRels.length > 0) {
      md += `- **关系**：\n`;
      for (const rel of charRels) {
        const otherId = rel.char_a_id === char.id ? rel.char_b_id : rel.char_a_id;
        const other = allCharacters.get(otherId) || ScriptCharacterDAO.getById(db, otherId);
        const otherName = other?.name || otherId;
        md += `  - 与 ${otherName}：${rel.relation_type}（强度 ${rel.intensity}）\n`;
      }
    }
    md += '\n';
  }

  return ProjectBibleDAO.upsert(db, projectId, 'character', md, 'ai');
}

// ═══════════════════════════════════════════════════════════════
// 世界观设定生成
// ═══════════════════════════════════════════════════════════════

export async function generateWorldSetting(
  db: Database,
  userId: string,
  projectId: string
): Promise<ProjectBible> {
  const episodes = NovelEpisodeDAO.listByProject(db, projectId);
  const allScenes: Map<string, ScriptScene> = new Map();

  for (const ep of episodes) {
    const scenes = ScriptSceneDAO.listByEpisode(db, ep.id);
    for (const s of scenes) {
      if (s.name) allScenes.set(s.name, s);
    }
  }

  let md = '# 世界观设定\n\n';
  md += `> 自动生成于 ${new Date().toLocaleString('zh-CN')}，共 ${allScenes.size} 个场景\n\n`;

  md += '## 主要场景\n\n';
  for (const [name, scene] of allScenes) {
    md += `### ${name}\n`;
    if (scene.description) md += `- **描述**：${scene.description}\n`;
    if ((scene as any).time_of_day) md += `- **时间**：${(scene as any).time_of_day}\n`;
    if ((scene as any).atmosphere) md += `- **氛围**：${(scene as any).atmosphere}\n`;
    md += '\n';
  }

  return ProjectBibleDAO.upsert(db, projectId, 'world', md, 'ai');
}

// ═══════════════════════════════════════════════════════════════
// 剧情摘要更新（每集完成后调用）
// ═══════════════════════════════════════════════════════════════

export async function updateStorySummary(
  db: Database,
  userId: string,
  projectId: string,
  episodeId: string
): Promise<ProjectBible> {
  const episode = NovelEpisodeDAO.getById(db, episodeId);
  const shots = ShotDAO.listByEpisode(db, episodeId);

  // 构建本集摘要
  let episodeSummary = `## 第${episode?.episode_number || '?'}集：${episode?.title || '未命名'}\n\n`;
  episodeSummary += `- **分镜数**：${shots.length}\n`;

  // 提取本集主要剧情（从分镜动作描述）
  const keyActions = shots.slice(0, 10).map((s, i) => `${i + 1}. ${(s.action_description || '').slice(0, 50)}`).join('\n');
  if (keyActions) {
    episodeSummary += `- **关键剧情**：\n${keyActions}\n`;
  }

  // 获取已有摘要，追加本集
  const existing = ProjectBibleDAO.getByProjectAndType(db, projectId, 'story');
  let md = '# 剧情摘要\n\n';
  md += `> 最后更新于 ${new Date().toLocaleString('zh-CN')}\n\n`;

  if (existing) {
    // 保留之前的摘要，追加新集
    const oldContent = existing.content.replace(/^# 剧情摘要\n\n>.*?\n\n/, '');
    md += oldContent + '\n' + episodeSummary;
  } else {
    md += episodeSummary;
  }

  return ProjectBibleDAO.upsert(db, projectId, 'story', md, 'ai');
}

// ═══════════════════════════════════════════════════════════════
// 伏笔识别（AI辅助）
// ═══════════════════════════════════════════════════════════════

export async function detectForeshadows(
  db: Database,
  userId: string,
  projectId: string,
  episodeId: string
): Promise<StoryForeshadow[]> {
  const shots = ShotDAO.listByEpisode(db, episodeId);
  const detected: StoryForeshadow[] = [];

  // 简单规则识别：包含"以后/将来/总有一天/秘密/真相/约定"等词的分镜
  const foreshadowKeywords = ['以后', '将来', '总有一天', '秘密', '真相', '约定', '承诺', '伏笔', '隐藏', '未解', '神秘'];

  for (const shot of shots) {
    const text = `${shot.action_description || ''} ${shot.dialogue || ''}`;
    for (const keyword of foreshadowKeywords) {
      if (text.includes(keyword)) {
        // 检查是否已存在相同描述的伏笔
        const existing = StoryForeshadowDAO.listByProject(db, projectId, 'open');
        const isDuplicate = existing.some(f =>
          f.description.includes(keyword) && text.includes(f.description.slice(0, 10))
        );
        if (!isDuplicate) {
          const foreshadow = StoryForeshadowDAO.create(db, {
            project_id: projectId,
            description: text.slice(0, 100),
            introduced_episode_id: episodeId,
            introduced_shot_id: shot.id,
            importance: 2,
          });
          detected.push(foreshadow);
        }
        break;
      }
    }
  }

  return detected;
}

// ═══════════════════════════════════════════════════════════════
// 构建记忆注入（生成前调用，拼接到系统提示词）
// ═══════════════════════════════════════════════════════════════

export interface MemoryInjection {
  characterBible: string;
  worldSetting: string;
  storySummary: string;
  openForeshadows: string;
  fullInjection: string;
}

/**
 * 构建项目记忆注入文本
 * 在生成分镜/视频/关键帧前调用，拼接到系统提示词中
 */
export function buildMemoryInjection(
  db: Database,
  projectId: string
): MemoryInjection {
  const charBible = ProjectBibleDAO.getByProjectAndType(db, projectId, 'character');
  const worldSetting = ProjectBibleDAO.getByProjectAndType(db, projectId, 'world');
  const storySummary = ProjectBibleDAO.getByProjectAndType(db, projectId, 'story');
  const openForeshadows = StoryForeshadowDAO.listByProject(db, projectId, 'open');

  let full = '';

  if (charBible?.content) {
    full += `【角色圣经·强制参考】\n${charBible.content}\n\n`;
  }
  if (worldSetting?.content) {
    full += `【世界观设定·强制参考】\n${worldSetting.content}\n\n`;
  }
  if (storySummary?.content) {
    full += `【剧情摘要·上下文参考】\n${storySummary.content}\n\n`;
  }
  if (openForeshadows.length > 0) {
    full += `【待回收伏笔·注意呼应】\n`;
    openForeshadows.forEach((f, i) => {
      full += `${i + 1}. ${f.description}（重要性${f.importance}）\n`;
    });
    full += '\n';
  }

  return {
    characterBible: charBible?.content || '',
    worldSetting: worldSetting?.content || '',
    storySummary: storySummary?.content || '',
    openForeshadows: openForeshadows.map(f => f.description).join('\n'),
    fullInjection: full,
  };
}

// ═══════════════════════════════════════════════════════════════
// 全量生成（项目初始化或重建时调用）
// ═══════════════════════════════════════════════════════════════

export async function generateAllMemory(
  db: Database,
  userId: string,
  projectId: string
): Promise<{ characterBible: ProjectBible; worldSetting: ProjectBible; foreshadows: number }> {
  // 1. 为所有剧集的角色生成标准化锚点
  const episodes = NovelEpisodeDAO.listByProject(db, projectId);
  for (const ep of episodes) {
    await generateCharacterAnchors(db, userId, projectId, ep.id);
  }

  // 2. 生成角色圣经
  const characterBible = await generateCharacterBible(db, userId, projectId);

  // 3. 生成世界观
  const worldSetting = await generateWorldSetting(db, userId, projectId);

  // 4. 识别伏笔
  let foreshadowCount = 0;
  for (const ep of episodes) {
    const detected = await detectForeshadows(db, userId, projectId, ep.id);
    foreshadowCount += detected.length;
  }

  return { characterBible, worldSetting: worldSetting, foreshadows: foreshadowCount };
}

// ═══════════════════════════════════════════════════════════════
// 导出服务对象
// ═══════════════════════════════════════════════════════════════

export const projectMemoryService = {
  standardizeCharacterAnchor,
  generateCharacterAnchors,
  generateCharacterBible,
  generateWorldSetting,
  updateStorySummary,
  detectForeshadows,
  buildMemoryInjection,
  generateAllMemory,
};
