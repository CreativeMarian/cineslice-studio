// 角色 DAO
// v1.1 - 添加 concept_images / four_view_images JSON 解析

import type { Database, ScriptCharacter } from '../types';
import { generateId, now } from './index';
import { safeJsonParse } from '../utils/json';

// 解析角色数据：将 JSON 字符串字段转为数组
function parseCharacter(row: any): ScriptCharacter {
  if (!row) return row;
  const result = { ...row };
  if (typeof result.concept_images === 'string') result.concept_images = safeJsonParse(result.concept_images, []);
  if (typeof result.four_view_images === 'string') result.four_view_images = safeJsonParse(result.four_view_images, []);
  if (result.concept_images === null) result.concept_images = [];
  if (result.four_view_images === null) result.four_view_images = [];
  // identity_lock / wardrobe 保持 JSON 字符串（由服务层按需解析），但确保 null 安全
  if (result.identity_lock === undefined) result.identity_lock = null;
  if (result.wardrobe === undefined) result.wardrobe = null;
  return result;
}

/**
 * P1-4: 删除角色时级联清理该项目所有分镜 JSON 字段中的该角色引用：
 * characters_in_shot（角色名/ID 数组）、blocking（调度条目）、character_outfits（{"角色名"/"角色ID":"造型名"}）
 * 遍历角色所在项目的全部剧集分镜；JSON 解析失败时保留原样（不误伤其他数据）
 */
function cleanShotReferences(db: Database, character: ScriptCharacter): void {
  const charId = character.id;
  const charName = character.name || '';
  if (!character.episode_id) return;
  const ep = db.prepare('SELECT project_id FROM novel_episodes WHERE id = ?').get(character.episode_id) as { project_id?: string } | undefined;
  if (!ep?.project_id) return;
  const episodes = db.prepare('SELECT id FROM novel_episodes WHERE project_id = ?').all(ep.project_id) as Array<{ id: string }>;
  if (episodes.length === 0) return;
  const placeholders = episodes.map(() => '?').join(',');
  const shotRows = db.prepare(
    `SELECT id, characters_in_shot, blocking, character_outfits FROM shots WHERE episode_id IN (${placeholders})`
  ).all(...episodes.map(e => e.id)) as any[];

  for (const row of shotRows) {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    // characters_in_shot：移除角色 ID / 名称
    if (row.characters_in_shot) {
      try {
        const arr = JSON.parse(row.characters_in_shot);
        if (Array.isArray(arr)) {
          const cleaned = arr.filter((x: any) => x !== charId && x !== charName);
          if (cleaned.length !== arr.length) {
            setClauses.push('characters_in_shot = ?');
            params.push(JSON.stringify(cleaned));
          }
        }
      } catch { /* 解析失败保留原样 */ }
    }

    // blocking：移除该角色调度条目（promptBuilder 对未匹配条目已有"角色"回退，不会输出 UUID）
    if (row.blocking) {
      try {
        const arr = JSON.parse(row.blocking);
        if (Array.isArray(arr)) {
          const cleaned = arr.filter((b: any) => b?.character_id !== charId && b?.character_name !== charName);
          if (cleaned.length !== arr.length) {
            setClauses.push('blocking = ?');
            params.push(JSON.stringify(cleaned));
          }
        }
      } catch { /* 解析失败保留原样 */ }
    }

    // character_outfits：移除该角色键（兼容 {"角色名":"造型名"} 与 {"角色ID":"造型名"} 两种格式）
    if (row.character_outfits) {
      try {
        const obj = JSON.parse(row.character_outfits);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          const cleaned: Record<string, string> = { ...obj };
          for (const key of Object.keys(cleaned)) {
            if (key === charId || key === charName) delete cleaned[key];
          }
          if (Object.keys(cleaned).length !== Object.keys(obj).length) {
            setClauses.push('character_outfits = ?');
            params.push(JSON.stringify(cleaned));
          }
        }
      } catch { /* 解析失败保留原样 */ }
    }

    if (setClauses.length > 0) {
      db.prepare(`UPDATE shots SET ${setClauses.join(', ')} WHERE id = ?`).run(...params, row.id);
    }
  }
}

export const ScriptCharacterDAO = {
  create(db: Database, data: { user_id: string; episode_id: string; name: string; gender?: string; role_type?: string; description?: string; visual_description?: string; character_profile?: string; visual_prompt?: string; voice_prompt?: string; detail_images?: string; identity_lock?: string; wardrobe?: string }): ScriptCharacter {
    const id = generateId('char');
    db.prepare(`
      INSERT INTO script_characters (id, user_id, episode_id, name, gender, role_type, description, visual_description, character_profile, visual_prompt, voice_prompt, detail_images, selected_image_index, identity_lock, wardrobe, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(id, data.user_id, data.episode_id, data.name, data.gender || 'other', data.role_type || 'supporting', data.description || '', data.visual_description || '', data.character_profile || null, data.visual_prompt || null, data.voice_prompt || null, data.detail_images || null, data.identity_lock || null, data.wardrobe || null, now(), now());
    return this.getById(db, id)!;
  },

  batchCreate(db: Database, characters: Array<{ user_id: string; episode_id: string; name: string; gender?: string; role_type?: string; description?: string; visual_description?: string; character_profile?: string; visual_prompt?: string; voice_prompt?: string; detail_images?: string; identity_lock?: string; wardrobe?: string }>): ScriptCharacter[] {
    const results: ScriptCharacter[] = [];
    const transaction = db.transaction(() => {
      for (const c of characters) {
        results.push(this.create(db, c));
      }
    });
    transaction();
    return results;
  },

  listByEpisode(db: Database, episodeId: string): ScriptCharacter[] {
    const rows = db.prepare('SELECT * FROM script_characters WHERE episode_id = ? ORDER BY created_at ASC').all(episodeId) as any[];
    return rows.map(parseCharacter);
  },

  getById(db: Database, id: string): ScriptCharacter | null {
    const row = db.prepare('SELECT * FROM script_characters WHERE id = ?').get(id) as any;
    return row ? parseCharacter(row) : null;
  },

  getByIds(db: Database, ids: string[]): ScriptCharacter[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM script_characters WHERE id IN (${placeholders}) ORDER BY created_at ASC`).all(...ids) as any[];
    return rows.map(parseCharacter);
  },

  getByIdAndUser(db: Database, id: string, userId: string): ScriptCharacter | null {
    const row = db.prepare('SELECT * FROM script_characters WHERE id = ? AND user_id = ?').get(id, userId) as any;
    return row ? parseCharacter(row) : null;
  },

  update(db: Database, id: string, data: Partial<ScriptCharacter>): ScriptCharacter | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE script_characters SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    // P1-25: 级联删除 character_outfits（角色删除后避免孤儿服装记录）
    db.prepare('DELETE FROM character_outfits WHERE character_id = ?').run(id);
    // P1-4: 级联清理该项目所有分镜 JSON 字段中的该角色引用（characters_in_shot/blocking/character_outfits）
    const character = this.getById(db, id);
    if (character) cleanShotReferences(db, character);
    db.prepare('DELETE FROM script_characters WHERE id = ?').run(id);
  },

  deleteByEpisode(db: Database, episodeId: string): void {
    // P1-25: 级联删除该集全部角色的服装记录
    db.prepare('DELETE FROM character_outfits WHERE character_id IN (SELECT id FROM script_characters WHERE episode_id = ?)').run(episodeId);
    db.prepare('DELETE FROM script_characters WHERE episode_id = ?').run(episodeId);
  },
};
