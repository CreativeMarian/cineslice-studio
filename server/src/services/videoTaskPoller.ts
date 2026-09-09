// 视频任务后台轮询器 v2：把外部视频供应商（ComfyUI 等）的异步任务状态回写项目库。
// 提交视频后若无人轮询，任务将永远停在 processing——本轮询器每 20s 扫描一次待推进任务，
// 复用 getVideoStatus 的完整链路（外部状态同步 → 视频下载落盘 → VLM 质量门 → 状态回写）。
// v2：每轮打印诊断日志，便于确认轮询器真实执行。
import type { Database } from '../types';
import { ShotVideoIntervalDAO } from '../models';
import { getVideoStatus } from './episodeProductionService';

const POLL_INTERVAL_MS = 15_000;
const MAX_CONCURRENT = 3;

let running = false;

export function startVideoTaskPoller(getDb: () => Database): NodeJS.Timeout {
  console.log('[VideoTaskPoller] 已启动，每 15s 轮询一次外部视频任务');
  return setInterval(async () => {
    if (running) {
      console.log('[VideoTaskPoller] 上一轮未结束，跳过本轮');
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const db = getDb();
      const tasks = ShotVideoIntervalDAO.listPendingExternal(db, 10);
      if (tasks.length === 0) return;
      console.log(`[VideoTaskPoller] 发现 ${tasks.length} 个待推进任务`);
      const batch = tasks.slice(0, MAX_CONCURRENT);
      for (const task of batch) {
        const before = task.status;
        try {
          await getVideoStatus(db, task.user_id, task.id);
          const after = ShotVideoIntervalDAO.getById(db, task.id)?.status;
          if (after !== before) {
            console.log(`[VideoTaskPoller] 任务 ${task.id.slice(0, 12)} ${before} -> ${after}`);
          }
        } catch (err) {
          console.warn(`[VideoTaskPoller] 任务 ${task.id.slice(0, 12)} 查询失败: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      console.warn('[VideoTaskPoller] 轮询异常:', (err as Error).message);
    } finally {
      running = false;
      console.log(`[VideoTaskPoller] 本轮完成，耗时 ${Date.now() - t0}ms`);
    }
  }, POLL_INTERVAL_MS);
}
