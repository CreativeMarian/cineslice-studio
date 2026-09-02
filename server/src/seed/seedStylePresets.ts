// 风格预设初始化脚本
// 在服务器启动时检查并导入内置风格预设

import type { Database } from '../types';
import { getAllStylePresets } from '../services/prompts/promptRecommendations';

/**
 * 初始化内置风格预设
 * 逐个检查预设ID是否存在，不存在才导入（支持增量导入）
 */
export function seedStylePresets(db: Database): void {
  try {
    const presets = getAllStylePresets();
    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;

    const insertStmt = db.prepare(`
      INSERT INTO style_presets (id, name, description, category, visual_style, camera_language, color_palette, shot_rhythm, video_params, is_builtin, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);

    const checkStmt = db.prepare('SELECT id FROM style_presets WHERE id = ?');

    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i];
      const presetId = `builtin_${preset.id}`;

      // 检查是否已存在
      const existing = checkStmt.get(presetId);
      if (existing) {
        skipped++;
        continue;
      }

      try {
        insertStmt.run(
          presetId,
          preset.name,
          preset.description,
          preset.category,
          preset.visualStyle,
          preset.cameraLanguage,
          preset.colorPalette,
          preset.rhythm,
          JSON.stringify({ suitableFor: preset.suitableFor }),
          i,
          now,
          now
        );
        imported++;
      } catch (err) {
        console.error(`[Seed] 导入预设 ${preset.name} 失败:`, (err as Error).message);
      }
    }

    if (imported > 0) {
      console.log(`[Seed] 风格预设导入完成: 新增 ${imported} 个，已存在 ${skipped} 个`);
    } else {
      console.log(`[Seed] 风格预设已全部存在（共 ${presets.length} 个），跳过导入`);
    }
  } catch (err) {
    console.error('[Seed] 风格预设初始化失败:', (err as Error).message);
  }
}
