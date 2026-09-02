// 共享资产库 DAO（P2）
// v1.0

import type { Database, AssetLibrary } from '../types';
import { generateId, now } from './index';

export const AssetLibraryDAO = {
  create(db: Database, data: { user_id: string; asset_type: string; name: string; description?: string; image_url?: string; source_project_id?: string; tags?: string; metadata?: string }): AssetLibrary {
    const id = generateId('asset');
    db.prepare(`
      INSERT INTO asset_library (id, user_id, asset_type, name, description, image_url, source_project_id, tags, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id, data.asset_type, data.name, data.description || '', data.image_url || null, data.source_project_id || null, data.tags || null, data.metadata || null, now());
    return this.getById(db, id)!;
  },

  listByUser(db: Database, userId: string, assetType?: string): AssetLibrary[] {
    if (assetType) {
      return db.prepare('SELECT * FROM asset_library WHERE user_id = ? AND asset_type = ? ORDER BY created_at DESC').all(userId, assetType) as AssetLibrary[];
    }
    return db.prepare('SELECT * FROM asset_library WHERE user_id = ? ORDER BY created_at DESC').all(userId) as AssetLibrary[];
  },

  getById(db: Database, id: string): AssetLibrary | null {
    return (db.prepare('SELECT * FROM asset_library WHERE id = ?').get(id) as AssetLibrary) || null;
  },

  update(db: Database, id: string, data: Partial<AssetLibrary>): AssetLibrary | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE asset_library SET ${sets} WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), id);
    return this.getById(db, id);
  },

  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM asset_library WHERE id = ?').run(id);
  },
};
