import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../helpers/db';
import { ShotVideoIntervalDAO, ModelRegistryDAO, ProjectDAO, NovelEpisodeDAO, ShotDAO, ensureLocalUser } from '../../server/src/models';
import { sanitizeFileName, isValidResourceId } from '../../server/src/utils/filename';
import type { SQLiteDatabase } from '../../server/src/config/sqliteDatabase';

describe('安全净化工具', () => {
  it('sanitizeFileName 折叠路径穿越为纯文件名', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\evil.mp3')).toBe('evil.mp3');
    expect(sanitizeFileName('a/b/c.mp3')).toBe('c.mp3');
    expect(sanitizeFileName('normal.mp3')).toBe('normal.mp3');
    expect(sanitizeFileName('中文配音.mp3')).toBe('中文配音.mp3');
  });

  it('sanitizeFileName 拒绝空名与纯点', () => {
    expect(sanitizeFileName('')).toBeNull();
    expect(sanitizeFileName('  ')).toBeNull();
    expect(sanitizeFileName('..')).toBeNull();
    expect(sanitizeFileName('.')).toBeNull();
  });

  it('isValidResourceId 拒绝穿越与特殊字符', () => {
    expect(isValidResourceId('proj_abc123')).toBe(true);
    expect(isValidResourceId('proj-9')).toBe(true);
    expect(isValidResourceId('../evil')).toBe(false);
    expect(isValidResourceId('a/b')).toBe(false);
    expect(isValidResourceId('proj x')).toBe(false);
    expect(isValidResourceId('')).toBe(false);
  });
});

describe('迁移 013：DAO/Schema 对齐', () => {
  let db: SQLiteDatabase;

  beforeEach(() => {
    db = createTestDb();
    ensureLocalUser(db);
  });

  afterEach(() => {
    closeTestDb(db);
  });

  it('shot_video_intervals 支持 video_model_used 列（视频生成不再 500）', () => {
    const project = ProjectDAO.create(db, { user_id: 'local_user', title: 'T' });
    const ep = NovelEpisodeDAO.create(db, {
      user_id: 'local_user', project_id: project.id, episode_number: 1, title: '第一集',
    });
    const shot = ShotDAO.create(db, {
      user_id: 'local_user', episode_id: ep.id, shot_number: 1, action_description: 'x',
    });
    const interval = ShotVideoIntervalDAO.create(db, {
      user_id: 'local_user',
      shot_id: shot.id,
      video_url: '/data/x.mp4',
      video_model_used: 'kling/v1',
    } as any);
    expect(interval.video_model_used).toBe('kling/v1');
  });

  it('model_registry 支持同模型多类型记录（不再 UNIQUE 冲突）', () => {
    ModelRegistryDAO.create(db, {
      user_id: 'local_user',
      provider: 'custom-openai',
      model_name: 'my-model',
      model_type: 'text',
      display_name: '自定义模型',
    } as any);
    // 同一 provider/model 不同 type 应可插入
    const second = ModelRegistryDAO.create(db, {
      user_id: 'local_user',
      provider: 'custom-openai',
      model_name: 'my-model',
      model_type: 'image',
      display_name: '自定义模型-图像',
    } as any);
    expect(second.model_type).toBe('image');
  });
});
