import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { StylePresetDAO } from '../../server/src/models';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('StylePresetDAO', () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    closeTestDb(db);
  });

  describe('listAll', () => {
    it('返回所有预设（含6个内置）', () => {
      const presets = StylePresetDAO.listAll(db);
      expect(presets.length).toBeGreaterThanOrEqual(6);
      const builtin = presets.filter(p => p.is_builtin === 1);
      expect(builtin.length).toBe(6);
    });

    it('内置预设包含古风仙侠', () => {
      const presets = StylePresetDAO.listAll(db);
      const guxian = presets.find(p => p.id === 'sp_guxian');
      expect(guxian).toBeDefined();
      expect(guxian?.name).toBe('古风仙侠');
      expect(guxian?.is_builtin).toBe(1);
    });

    it('内置预设包含赛博朋克', () => {
      const presets = StylePresetDAO.listAll(db);
      const cyber = presets.find(p => p.id === 'sp_cyberpunk');
      expect(cyber).toBeDefined();
      expect(cyber?.name).toBe('赛博朋克');
    });
  });

  describe('listBuiltin', () => {
    it('只返回内置预设', () => {
      const builtin = StylePresetDAO.listBuiltin(db);
      expect(builtin.length).toBe(6);
      expect(builtin.every(p => p.is_builtin === 1)).toBe(true);
    });
  });

  describe('getById', () => {
    it('获取内置预设', () => {
      const preset = StylePresetDAO.getById(db, 'sp_tianchong');
      expect(preset).not.toBeNull();
      expect(preset?.name).toBe('甜宠恋爱');
    });

    it('不存在返回 null', () => {
      expect(StylePresetDAO.getById(db, 'nonexistent')).toBeNull();
    });
  });

  describe('create', () => {
    it('创建自定义预设', () => {
      const preset = StylePresetDAO.create(db, {
        name: '自定义风格',
        visual_style: '测试风格描述',
        category: 'custom',
      });
      expect(preset.id).toMatch(/^sp_/);
      expect(preset.name).toBe('自定义风格');
      expect(preset.is_builtin).toBe(0);
    });
  });

  describe('update', () => {
    it('更新自定义预设', () => {
      const preset = StylePresetDAO.create(db, {
        name: '原名称',
        visual_style: '原风格',
      });
      const updated = StylePresetDAO.update(db, preset.id, { name: '新名称' });
      expect(updated?.name).toBe('新名称');
    });

    it('不能更新内置预设', () => {
      const result = StylePresetDAO.update(db, 'sp_guxian', { name: '改名' });
      // 内置预设更新会被 WHERE is_builtin = 0 过滤，返回原记录
      expect(result?.name).toBe('古风仙侠');
    });
  });

  describe('delete', () => {
    it('删除自定义预设', () => {
      const preset = StylePresetDAO.create(db, {
        name: '待删除',
        visual_style: '测试',
      });
      StylePresetDAO.delete(db, preset.id);
      expect(StylePresetDAO.getById(db, preset.id)).toBeNull();
    });

    it('不能删除内置预设', () => {
      StylePresetDAO.delete(db, 'sp_rexue');
      expect(StylePresetDAO.getById(db, 'sp_rexue')).not.toBeNull();
    });
  });
});
