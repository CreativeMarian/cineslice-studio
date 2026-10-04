// P1-28: 分段（Segment）聚合单元测试
// 覆盖 SegmentDAO.autoAggregate 核心聚合规则：
//   - 6×5s 镜头 → 2 段 × 3 镜（每段 8-15s / 2-4 镜）
//   - 单镜 >15s → 独立成段
//   - 空镜头 → 0 段
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb } from '../../../../tests/helpers/db';
import { SegmentDAO } from '../../models/segment';
import { ProjectDAO, NovelEpisodeDAO, ShotDAO, ensureLocalUser } from '../../models';
import type { SQLiteDatabase } from '../../config/sqliteDatabase';

describe('SegmentDAO.autoAggregate', () => {
  let db: SQLiteDatabase;
  let episodeId: string;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    // 兼容运行时行为：index.ts 启动时幂等补充 style_description 列（未纳入迁移文件）
    db.exec('ALTER TABLE projects ADD COLUMN style_description TEXT');
    ensureLocalUser(db);
    userId = 'local_user';
    const project = ProjectDAO.create(db, { user_id: userId, title: '测试项目' });
    const episode = NovelEpisodeDAO.create(db, {
      user_id: userId,
      project_id: project.id,
      episode_number: 1,
      title: '第一集',
    });
    episodeId = episode.id;
  });

  afterEach(() => {
    closeTestDb(db);
  });

  function addShot(shotNumber: number, durationSeconds = 5): void {
    ShotDAO.create(db, {
      user_id: userId,
      episode_id: episodeId,
      shot_number: shotNumber,
      duration_seconds: durationSeconds,
    });
  }

  it('6×5s 镜头聚合为 2 段 × 3 镜（每段 15s）', () => {
    for (let n = 1; n <= 6; n++) addShot(n, 5);

    const segments = SegmentDAO.autoAggregate(db, episodeId, userId);

    expect(segments).toHaveLength(2);
    expect(segments[0].segment_number).toBe(1);
    expect(segments[0].start_shot_number).toBe(1);
    expect(segments[0].end_shot_number).toBe(3);
    expect(segments[0].duration_seconds).toBe(15);
    expect(segments[1].segment_number).toBe(2);
    expect(segments[1].start_shot_number).toBe(4);
    expect(segments[1].end_shot_number).toBe(6);
    expect(segments[1].duration_seconds).toBe(15);

    // shots.segment_id 已回写：1-3 归第 1 段，4-6 归第 2 段
    const shots = ShotDAO.listByEpisode(db, episodeId);
    expect(shots.filter(s => s.segment_id === 1)).toHaveLength(3);
    expect(shots.filter(s => s.segment_id === 2)).toHaveLength(3);
  });

  it('单镜 >15s 独立成段', () => {
    addShot(1, 20);

    const segments = SegmentDAO.autoAggregate(db, episodeId, userId);

    expect(segments).toHaveLength(1);
    expect(segments[0].start_shot_number).toBe(1);
    expect(segments[0].end_shot_number).toBe(1);
    expect(segments[0].duration_seconds).toBe(20);
  });

  it('空镜头返回 0 段', () => {
    const segments = SegmentDAO.autoAggregate(db, episodeId, userId);
    expect(segments).toHaveLength(0);
  });
});
