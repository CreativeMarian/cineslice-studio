// 分段（Segment）DAO
// P2-2: 一个 segment = 8-15秒 = 2-4个镜头
// 视频生成按 segment 提交，可单独重试，最终合成按 segment concat

import type { Database, Segment } from '../types';
import { generateId, now } from './index';
import { SEGMENT_MAX_DURATION, SEGMENT_MIN_SHOTS, SEGMENT_MAX_SHOTS } from '../constants';

export const SegmentDAO = {
  /**
   * 创建一条 segment 记录。
   * @param db 数据库实例
   * @param data 段数据（user_id/episode_id/segment_number 必填，其余可选）
   * @returns 新创建的 Segment（含默认值：name=''、duration_seconds=0、status='pending'）
   * @sideEffects 向 segments 表插入一行
   */
  create(db: Database, data: {
    user_id: string;
    project_id?: string | null;
    episode_id: string;
    segment_number: number;
    name?: string;
    start_shot_id?: string | null;
    end_shot_id?: string | null;
    start_shot_number?: number | null;
    end_shot_number?: number | null;
    duration_seconds?: number;
    status?: string;
  }): Segment {
    const id = generateId('seg');
    db.prepare(`
      INSERT INTO segments (id, user_id, project_id, episode_id, segment_number, name, start_shot_id, end_shot_id, start_shot_number, end_shot_number, duration_seconds, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.user_id,
      data.project_id || null,
      data.episode_id,
      data.segment_number,
      data.name || '',
      data.start_shot_id || null,
      data.end_shot_id || null,
      data.start_shot_number ?? null,
      data.end_shot_number ?? null,
      data.duration_seconds || 0,
      data.status || 'pending',
      now(),
      now(),
    );
    return this.getById(db, id)!;
  },

  /**
   * 按剧集查询段列表（按段号升序）。
   * @param db 数据库实例
   * @param episodeId 剧集 ID
   * @returns Segment[]，无数据时返回空数组
   */
  listByEpisode(db: Database, episodeId: string): Segment[] {
    return db.prepare('SELECT * FROM segments WHERE episode_id = ? ORDER BY segment_number ASC').all(episodeId) as Segment[];
  },

  /**
   * 按 ID 查询单条段记录。
   * @param db 数据库实例
   * @param id 段 ID
   * @returns Segment | null（不存在时返回 null）
   */
  getById(db: Database, id: string): Segment | null {
    return (db.prepare('SELECT * FROM segments WHERE id = ?').get(id) as Segment) || null;
  },

  /**
   * 更新段记录（动态字段，自动维护 updated_at）。
   * @param db 数据库实例
   * @param id 段 ID
   * @param data 待更新字段（Partial<Segment>；不含 id）
   * @returns 更新后的 Segment | null
   * @sideEffects 向 segments 表执行 UPDATE；无字段时仅查询返回
   */
  update(db: Database, id: string, data: Partial<Segment>): Segment | null {
    const fields = Object.keys(data).filter(k => k !== 'id');
    if (fields.length === 0) return this.getById(db, id);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE segments SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...fields.map(f => (data as any)[f]), now(), id);
    return this.getById(db, id);
  },

  /**
   * 删除单条段记录。
   * @param db 数据库实例
   * @param id 段 ID
   * @sideEffects 从 segments 表删除一行
   */
  delete(db: Database, id: string): void {
    db.prepare('DELETE FROM segments WHERE id = ?').run(id);
  },

  /**
   * 删除某剧集全部段记录（幂等聚合前清旧段用）。
   * @param db 数据库实例
   * @param episodeId 剧集 ID
   * @sideEffects 从 segments 表删除该集全部行
   */
  deleteByEpisode(db: Database, episodeId: string): void {
    db.prepare('DELETE FROM segments WHERE episode_id = ?').run(episodeId);
  },

  /**
   * 根据镜头时长自动聚合成 segments（每段8-15秒，2-4个镜头，幂等重建）。
   * @param db 数据库实例
   * @param episodeId 剧集 ID
   * @param userId 当前用户 ID（新段归属）
   * @param projectId 项目 ID（可选，写入段记录）
   * @returns 新建的 Segment[]；该集无镜头时返回空数组
   * @sideEffects 在单事务内：清除旧段 → 创建新段 → 回写 shots.segment_id（失败自动回滚）
   */
  autoAggregate(db: Database, episodeId: string, userId: string, projectId?: string): Segment[] {
    const shots = db.prepare(
      'SELECT id, shot_number, duration_seconds FROM shots WHERE episode_id = ? ORDER BY shot_number ASC'
    ).all(episodeId) as Array<{ id: string; shot_number: number; duration_seconds: number }>;

    if (shots.length === 0) return [];

    // P1-5: 清旧段 + 建新段 + 回写 shots.segment_id 整体放入同一事务，
    // 中途失败（如唯一索引冲突）自动回滚，避免"旧段已删、新段半建"的脏状态
    const dao = this;
    return db.transaction(() => {
      // 清除旧 segments
      dao.deleteByEpisode(db, episodeId);

      const segments: Segment[] = [];
      let segNumber = 1;
      let i = 0;

      while (i < shots.length) {
        const segShots: Array<{ id: string; shot_number: number; duration_seconds: number }> = [];
        let totalDuration = 0;

        // 聚合：每段2-4个镜头，总时长8-15秒（常量：SEGMENT_MIN_SHOTS/SEGMENT_MAX_SHOTS/SEGMENT_MAX_DURATION）
        while (i < shots.length && segShots.length < SEGMENT_MAX_SHOTS) {
          const shot = shots[i];
          const newDuration = totalDuration + (shot.duration_seconds || 5);

          // 如果已经有至少2个镜头且加上这个会超过15秒，结束本段
          if (segShots.length >= SEGMENT_MIN_SHOTS && newDuration > SEGMENT_MAX_DURATION) {
            break;
          }

          segShots.push(shot);
          totalDuration = newDuration;
          i++;

          // 如果已经4个镜头，结束本段
          if (segShots.length >= SEGMENT_MAX_SHOTS) break;
        }

        // 兜底：如果只剩1个镜头且本段为空，至少放1个
        if (segShots.length === 0 && i < shots.length) {
          segShots.push(shots[i]);
          totalDuration = shots[i].duration_seconds || 5;
          i++;
        }

        const firstShot = segShots[0];
        const lastShot = segShots[segShots.length - 1];

        const segment = dao.create(db, {
          user_id: userId,
          project_id: projectId || null,
          episode_id: episodeId,
          segment_number: segNumber,
          name: `第${segNumber}段`,
          start_shot_id: firstShot.id,
          end_shot_id: lastShot.id,
          start_shot_number: firstShot.shot_number,
          end_shot_number: lastShot.shot_number,
          duration_seconds: totalDuration,
          status: 'pending',
        });

        // 更新 shots 的 segment_id
        const updateStmt = db.prepare('UPDATE shots SET segment_id = ? WHERE id = ?');
        for (const s of segShots) {
          updateStmt.run(segNumber, s.id);
        }

        segments.push(segment);
        segNumber++;
      }

      return segments;
    })();
  },
};
