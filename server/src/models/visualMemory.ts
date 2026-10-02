// P0-2: 视觉记忆库 DAO
// 所有关键帧自动入库，按角色/场景/道具索引，支持历史帧检索

import type { Database, VisualMemory, VisualMemoryType } from '../types';
import { generateId, now } from './index';

export const VisualMemoryDAO = {
  create(db: Database, data: {
    project_id: string;
    episode_id: string;
    shot_id?: string | null;
    keyframe_id?: string | null;
    image_url: string;
    memory_type: VisualMemoryType;
    entity_name?: string;
    entity_id?: string | null;
    shot_number?: number;
    frame_type?: string;
    metadata?: string;
    quality_score?: number;
    is_reference?: number;
  }): VisualMemory {
    const id = generateId('vmem');
    db.prepare(`
      INSERT INTO visual_memory (id, project_id, episode_id, shot_id, keyframe_id, image_url, memory_type, entity_name, entity_id, shot_number, frame_type, metadata, quality_score, is_reference, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.project_id, data.episode_id, data.shot_id || null, data.keyframe_id || null,
      data.image_url, data.memory_type, data.entity_name || '', data.entity_id || null,
      data.shot_number || 0, data.frame_type || '', data.metadata || '',
      data.quality_score || 0, data.is_reference ?? 0, now(), now()
    );
    return this.getById(db, id)!;
  },

  getById(db: Database, id: string): VisualMemory | null {
    return db.prepare('SELECT * FROM visual_memory WHERE id = ?').get(id) as VisualMemory | null;
  },

  listByProject(db: Database, projectId: string, limit: number = 100): VisualMemory[] {
    return db.prepare('SELECT * FROM visual_memory WHERE project_id = ? ORDER BY shot_number ASC, created_at ASC LIMIT ?')
      .all(projectId, limit) as VisualMemory[];
  },

  // 按实体名检索（角色名/场景名/道具名）
  listByEntity(db: Database, projectId: string, entityName: string, memoryType?: VisualMemoryType, limit: number = 10): VisualMemory[] {
    if (memoryType) {
      return db.prepare(`SELECT * FROM visual_memory WHERE project_id = ? AND entity_name = ? AND memory_type = ? AND is_reference = 1 ORDER BY quality_score DESC, shot_number DESC LIMIT ?`)
        .all(projectId, entityName, memoryType, limit) as VisualMemory[];
    }
    return db.prepare(`SELECT * FROM visual_memory WHERE project_id = ? AND entity_name = ? AND is_reference = 1 ORDER BY quality_score DESC, shot_number DESC LIMIT ?`)
      .all(projectId, entityName, limit) as VisualMemory[];
  },

  // 按类型检索（所有角色/场景/道具记忆）
  listByType(db: Database, projectId: string, memoryType: VisualMemoryType, limit: number = 50): VisualMemory[] {
    return db.prepare(`SELECT * FROM visual_memory WHERE project_id = ? AND memory_type = ? AND is_reference = 1 ORDER BY quality_score DESC, shot_number DESC LIMIT ?`)
      .all(projectId, memoryType, limit) as VisualMemory[];
  },

  // 按镜头检索（该镜头的所有记忆帧）
  listByShot(db: Database, projectId: string, shotId: string): VisualMemory[] {
    return db.prepare('SELECT * FROM visual_memory WHERE project_id = ? AND shot_id = ? ORDER BY created_at ASC')
      .all(projectId, shotId) as VisualMemory[];
  },

  // 检索某镜头之前的历史帧（用于首尾帧衔接和上下文参考）
  listBeforeShot(db: Database, projectId: string, shotNumber: number, limit: number = 10): VisualMemory[] {
    return db.prepare(`SELECT * FROM visual_memory WHERE project_id = ? AND shot_number < ? AND is_reference = 1 ORDER BY shot_number DESC LIMIT ?`)
      .all(projectId, shotNumber, limit) as VisualMemory[];
  },

  // 检索同角色的近期历史帧（3-5张，按时间倒序）
  listRecentByEntity(db: Database, projectId: string, entityName: string, limit: number = 5): VisualMemory[] {
    return db.prepare(`SELECT * FROM visual_memory WHERE project_id = ? AND entity_name = ? ORDER BY shot_number DESC, created_at DESC LIMIT ?`)
      .all(projectId, entityName, limit) as VisualMemory[];
  },

  update(db: Database, id: string, data: Partial<VisualMemory>): VisualMemory | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE visual_memory SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  // 标记为优质参考图
  markAsReference(db: Database, id: string, qualityScore: number = 0.8): VisualMemory | null {
    return this.update(db, id, { is_reference: 1, quality_score: qualityScore });
  },

  // 检查是否已存在（避免重复入库）
  existsByKeyframe(db: Database, keyframeId: string): boolean {
    const row = db.prepare('SELECT id FROM visual_memory WHERE keyframe_id = ? LIMIT 1').get(keyframeId);
    return !!row;
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM visual_memory WHERE id = ?').run(id);
  },

  deleteByProject(db: Database, projectId: string): void {
    db.prepare('DELETE FROM visual_memory WHERE project_id = ?').run(projectId);
  },

  // 统计
  countByProject(db: Database, projectId: string): number {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM visual_memory WHERE project_id = ?').get(projectId) as { cnt: number };
    return row.cnt;
  },
};
