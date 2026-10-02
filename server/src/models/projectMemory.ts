// P0-1: 项目级长期记忆 DAO
// project_bible / story_foreshadow / character_relationship

import type { Database, ProjectBible, StoryForeshadow, CharacterRelationship, BibleType, ForeshadowStatus, RelationType } from '../types';
import { generateId, now } from './index';

// ═══════════════════════════════════════════════════════════════
// ProjectBible DAO
// ═══════════════════════════════════════════════════════════════

export const ProjectBibleDAO = {
  create(db: Database, data: { project_id: string; bible_type: BibleType; content: string; generated_by?: string }): ProjectBible {
    const id = generateId('bible');
    db.prepare(`
      INSERT INTO project_bible (id, project_id, bible_type, content, version, generated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, data.project_id, data.bible_type, data.content, data.generated_by || 'system', now(), now());
    return this.getById(db, id)!;
  },

  getById(db: Database, id: string): ProjectBible | null {
    return db.prepare('SELECT * FROM project_bible WHERE id = ?').get(id) as ProjectBible | null;
  },

  getByProjectAndType(db: Database, projectId: string, bibleType: BibleType): ProjectBible | null {
    return db.prepare('SELECT * FROM project_bible WHERE project_id = ? AND bible_type = ? ORDER BY version DESC LIMIT 1')
      .get(projectId, bibleType) as ProjectBible | null;
  },

  listByProject(db: Database, projectId: string): ProjectBible[] {
    return db.prepare('SELECT * FROM project_bible WHERE project_id = ? ORDER BY bible_type, version DESC')
      .all(projectId) as ProjectBible[];
  },

  update(db: Database, id: string, data: { content?: string; generated_by?: string }): ProjectBible | null {
    const existing = this.getById(db, id);
    if (!existing) return null;
    const newVersion = existing.version + 1;
    db.prepare(`UPDATE project_bible SET content = ?, version = ?, generated_by = ?, updated_at = ? WHERE id = ?`)
      .run(data.content ?? existing.content, newVersion, data.generated_by ?? existing.generated_by, now(), id);
    return this.getById(db, id);
  },

  upsert(db: Database, projectId: string, bibleType: BibleType, content: string, generatedBy: string = 'ai'): ProjectBible {
    const existing = this.getByProjectAndType(db, projectId, bibleType);
    if (existing) {
      return this.update(db, existing.id, { content, generated_by: generatedBy })!;
    }
    return this.create(db, { project_id: projectId, bible_type: bibleType, content, generated_by: generatedBy });
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM project_bible WHERE id = ?').run(id);
  },

  deleteByProject(db: Database, projectId: string): void {
    db.prepare('DELETE FROM project_bible WHERE project_id = ?').run(projectId);
  },
};

// ═══════════════════════════════════════════════════════════════
// StoryForeshadow DAO
// ═══════════════════════════════════════════════════════════════

export const StoryForeshadowDAO = {
  create(db: Database, data: {
    project_id: string;
    description: string;
    introduced_episode_id?: string | null;
    introduced_shot_id?: string | null;
    importance?: number;
  }): StoryForeshadow {
    const id = generateId('foreshadow');
    db.prepare(`
      INSERT INTO story_foreshadow (id, project_id, description, introduced_episode_id, introduced_shot_id, status, importance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(id, data.project_id, data.description, data.introduced_episode_id || null, data.introduced_shot_id || null, data.importance || 1, now(), now());
    return this.getById(db, id)!;
  },

  getById(db: Database, id: string): StoryForeshadow | null {
    return db.prepare('SELECT * FROM story_foreshadow WHERE id = ?').get(id) as StoryForeshadow | null;
  },

  listByProject(db: Database, projectId: string, status?: ForeshadowStatus): StoryForeshadow[] {
    if (status) {
      return db.prepare('SELECT * FROM story_foreshadow WHERE project_id = ? AND status = ? ORDER BY importance DESC, created_at ASC')
        .all(projectId, status) as StoryForeshadow[];
    }
    return db.prepare('SELECT * FROM story_foreshadow WHERE project_id = ? ORDER BY status, importance DESC, created_at ASC')
      .all(projectId) as StoryForeshadow[];
  },

  update(db: Database, id: string, data: Partial<StoryForeshadow>): StoryForeshadow | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE story_foreshadow SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  resolve(db: Database, id: string, resolvedEpisodeId: string, note: string = ''): StoryForeshadow | null {
    return this.update(db, id, { status: 'resolved', resolved_episode_id: resolvedEpisodeId, resolution_note: note });
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM story_foreshadow WHERE id = ?').run(id);
  },

  deleteByProject(db: Database, projectId: string): void {
    db.prepare('DELETE FROM story_foreshadow WHERE project_id = ?').run(projectId);
  },
};

// ═══════════════════════════════════════════════════════════════
// CharacterRelationship DAO
// ═══════════════════════════════════════════════════════════════

export const CharacterRelationshipDAO = {
  create(db: Database, data: {
    project_id: string;
    char_a_id: string;
    char_b_id: string;
    relation_type: RelationType;
    intensity?: number;
    description?: string;
    last_updated_episode_id?: string | null;
  }): CharacterRelationship {
    const id = generateId('rel');
    db.prepare(`
      INSERT INTO character_relationship (id, project_id, char_a_id, char_b_id, relation_type, intensity, description, last_updated_episode_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.project_id, data.char_a_id, data.char_b_id, data.relation_type, data.intensity || 0, data.description || '', data.last_updated_episode_id || null, now(), now());
    return this.getById(db, id)!;
  },

  getById(db: Database, id: string): CharacterRelationship | null {
    return db.prepare('SELECT * FROM character_relationship WHERE id = ?').get(id) as CharacterRelationship | null;
  },

  listByProject(db: Database, projectId: string): CharacterRelationship[] {
    return db.prepare('SELECT * FROM character_relationship WHERE project_id = ? ORDER BY ABS(intensity) DESC')
      .all(projectId) as CharacterRelationship[];
  },

  listByCharacter(db: Database, projectId: string, characterId: string): CharacterRelationship[] {
    return db.prepare('SELECT * FROM character_relationship WHERE project_id = ? AND (char_a_id = ? OR char_b_id = ?) ORDER BY ABS(intensity) DESC')
      .all(projectId, characterId, characterId) as CharacterRelationship[];
  },

  getBetween(db: Database, projectId: string, charAId: string, charBId: string): CharacterRelationship | null {
    return db.prepare('SELECT * FROM character_relationship WHERE project_id = ? AND ((char_a_id = ? AND char_b_id = ?) OR (char_a_id = ? AND char_b_id = ?)) LIMIT 1')
      .get(projectId, charAId, charBId, charBId, charAId) as CharacterRelationship | null;
  },

  upsert(db: Database, data: {
    project_id: string;
    char_a_id: string;
    char_b_id: string;
    relation_type: RelationType;
    intensity?: number;
    description?: string;
    last_updated_episode_id?: string | null;
  }): CharacterRelationship {
    const existing = this.getBetween(db, data.project_id, data.char_a_id, data.char_b_id);
    if (existing) {
      return this.update(db, existing.id, {
        relation_type: data.relation_type,
        intensity: data.intensity ?? existing.intensity,
        description: data.description ?? existing.description,
        last_updated_episode_id: data.last_updated_episode_id ?? existing.last_updated_episode_id,
      })!;
    }
    return this.create(db, data);
  },

  update(db: Database, id: string, data: Partial<CharacterRelationship>): CharacterRelationship | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE character_relationship SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM character_relationship WHERE id = ?').run(id);
  },

  deleteByProject(db: Database, projectId: string): void {
    db.prepare('DELETE FROM character_relationship WHERE project_id = ?').run(projectId);
  },
};
