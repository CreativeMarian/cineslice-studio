// 镜头 DAO
// v2.0 — 增加 subject/lighting/mood/transition/pace 字段
// v2.1 — 统一 characters_in_shot 解析（支持数组/JSON字符串/逗号分隔三种格式）

import type { Database, Shot } from '../types';
import { generateId, now } from './index';

/**
 * 统一解析 characters_in_shot 字段
 * 支持三种格式：
 * 1. 数组：['角色1', '角色2']
 * 2. JSON字符串：'["角色1", "角色2"]'
 * 3. 逗号分隔：'角色1,角色2' 或 '角色1, 角色2'
 * @returns 角色名数组
 */
export function parseCharactersInShot(value: any): string[] {
  if (!value) return [];

  // 数组格式
  if (Array.isArray(value)) {
    return value.filter((v: any) => typeof v === 'string' && v.trim()).map((v: string) => v.trim());
  }

  // 字符串格式
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    // 尝试 JSON 解析（数组格式）
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((v: any) => typeof v === 'string' && v.trim()).map((v: string) => v.trim());
        }
      } catch {
        // JSON 解析失败，继续尝试逗号分隔
      }
    }

    // 逗号分隔格式
    return trimmed
      .split(/[,，]/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  return [];
}

/**
 * 序列化 characters_in_shot 为统一格式（JSON字符串）
 * @param characters 角色名数组
 * @returns JSON字符串或null
 */
export function serializeCharactersInShot(characters: string[]): string | null {
  if (!characters || characters.length === 0) return null;
  return JSON.stringify(characters);
}

/** 统一解析 props_in_shot 字段（与 parseCharactersInShot 同规则） */
export function parsePropsInShot(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v: any) => typeof v === 'string' && v.trim()).map((v: string) => v.trim());
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((v: any) => typeof v === 'string' && v.trim()).map((v: string) => v.trim());
        }
      } catch { /* fallthrough */ }
    }
    return trimmed.split(/[,，]/).map(s => s.trim()).filter(s => s.length > 0);
  }
  return [];
}

/** 安全解析 character_outfits JSON */
export function parseCharacterOutfits(value: any): Record<string, string> | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}
const safeParseOutfits = parseCharacterOutfits;

/** 将 SQL 行解析为前端/API 期望的 Shot（characters_in_shot / props_in_shot 转为数组） */
export function mapShotRow(row: any): Shot {
  if (!row) return row;
  return {
    ...row,
    characters_in_shot: row.characters_in_shot ? parseCharactersInShot(row.characters_in_shot) : null,
    props_in_shot: row.props_in_shot ? parsePropsInShot(row.props_in_shot) : null,
    character_outfits: row.character_outfits ? safeParseOutfits(row.character_outfits) : null,
  };
}

/** 序列化 props_in_shot 为 JSON 字符串 */
export function serializePropsInShot(props: string[]): string | null {
  if (!props || props.length === 0) return null;
  return JSON.stringify(props);
}

export const ShotDAO = {
  create(db: Database, data: {
    user_id: string; episode_id: string; scene_id?: string; shot_number: number;
    shot_size?: string; action_description?: string; dialogue?: string;
    camera_movement?: string; grid_position?: string; duration_seconds?: number;
    characters_in_shot?: string; props_in_shot?: string; notes?: string;
    subject?: string; lighting?: string; mood?: string; transition?: string; pace?: string;
    character_outfits?: string;
    phase?: number | null;
    phase_name?: string | null;
    first_frame_description?: string | null;
    last_frame_description?: string | null;
  }): Shot {
    const id = generateId('shot');
    db.prepare(`
      INSERT INTO shots (id, user_id, episode_id, scene_id, shot_number, shot_size, action_description, dialogue, camera_movement, grid_position, duration_seconds, characters_in_shot, props_in_shot, notes, subject, lighting, mood, transition, pace, character_outfits, phase, phase_name, first_frame_description, last_frame_description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.user_id, data.episode_id, data.scene_id || null,
      data.shot_number, data.shot_size || 'medium', data.action_description || '',
      data.dialogue || '', data.camera_movement || 'static', data.grid_position || '5',
      data.duration_seconds || 5.0, data.characters_in_shot || null,
      data.props_in_shot || null, data.notes || null,
      data.subject || null, data.lighting || null, data.mood || null,
      data.transition || 'cut', data.pace || 'normal',
      data.character_outfits || null,
      data.phase ?? null, data.phase_name || null,
      data.first_frame_description || null, data.last_frame_description || null,
      now(), now(),
    );
    return this.getById(db, id)!;
  },

  batchCreate(db: Database, shots: Array<any>): Shot[] {
    const results: Shot[] = [];
    const transaction = db.transaction(() => {
      for (const s of shots) {
        results.push(this.create(db, s));
      }
    });
    transaction();
    return results;
  },

  listByEpisode(db: Database, episodeId: string): Shot[] {
    const rows = db.prepare('SELECT * FROM shots WHERE episode_id = ? ORDER BY shot_number ASC').all(episodeId) as any[];
    return rows.map(mapShotRow);
  },

  getById(db: Database, id: string): Shot | null {
    const row = db.prepare('SELECT * FROM shots WHERE id = ?').get(id) as any;
    return row ? mapShotRow(row) : null;
  },

  getByIds(db: Database, ids: string[]): Shot[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT * FROM shots WHERE id IN (${placeholders}) ORDER BY shot_number ASC`).all(...ids) as any[];
    return rows.map(mapShotRow);
  },

  getByIdAndUser(db: Database, id: string, userId: string): Shot | null {
    const row = db.prepare('SELECT * FROM shots WHERE id = ? AND user_id = ?').get(id, userId) as any;
    return row ? mapShotRow(row) : null;
  },

  update(db: Database, id: string, data: Partial<Shot>): Shot | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE shots SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM shots WHERE id = ?').run(id);
  },

  deleteByEpisode(db: Database, episodeId: string): void {
    db.prepare('DELETE FROM shots WHERE episode_id = ?').run(episodeId);
  },

  getMaxShotNumber(db: Database, episodeId: string): number {
    const result = db.prepare('SELECT MAX(shot_number) as max FROM shots WHERE episode_id = ?').get(episodeId) as { max: number | null };
    return result.max || 0;
  },
};
