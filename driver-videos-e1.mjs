// driver-videos-e1.mjs — E1 全镜头视频驱动（每镜用其首帧关键帧 → ref2va 图生视频）
// 用法: node driver-videos-e1.mjs [--poll]  （--poll 只轮询不提交）
import fs from 'fs';
import Database from 'better-sqlite3';

const API = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-videos-e1.log';
const EPISODES = ['ep_4b6d11ae648c4072'];
const POLL_ONLY = process.argv.includes('--poll');
const db = new Database('data/cineslice-studio.db', { readonly: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, opts);
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json).substring(0, 300)}`);
  return json;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const jobs = [];
  for (const epId of EPISODES) {
    const shots = db.prepare('SELECT id, shot_number, phase FROM shots WHERE episode_id = ? ORDER BY shot_number').all(epId);
    for (const s of shots) {
      const kf = db.prepare("SELECT id FROM shot_keyframes WHERE shot_id=? AND frame_type='first' AND image_url IS NOT NULL AND image_url != '' ORDER BY created_at DESC LIMIT 1").get(s.id);
      const done = db.prepare("SELECT id FROM shot_video_intervals WHERE shot_id=? AND status='completed'").get(s.id);
      jobs.push({ shotId: s.id, shotNumber: s.shot_number, phase: s.phase, kfId: kf ? kf.id : null, done: !!done });
    }
  }
  const todo = jobs.filter(j => !j.done);
  const withKf = todo.filter(j => j.kfId);
  const noKf = todo.filter(j => !j.kfId);
  log(`E1 共 ${jobs.length} 镜；已完成 ${jobs.length - todo.length}；待生成 ${todo.length}（有关键帧 ${withKf.length}，缺关键帧 ${noKf.length}）`);

  if (!POLL_ONLY) {
    let submitted = 0;
    for (const j of withKf) {
      const body = {
        provider: 'comfyui',
        modelName: 'minimax-h3-video.json',
        keyframeId: j.kfId,
        duration: 5,
        ratio: '16:9',
        resolution: '720p',
      };
      try {
        const r = await api(`/api/shots/${j.shotId}/video/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        submitted++;
        log(`已提交 镜头${j.shotNumber}(phase${j.phase}) -> vid=${r.data && r.data.id}`);
      } catch (e) {
        log(`提交失败 镜头${j.shotNumber}: ${e.message}`);
      }
      await sleep(2000);
    }
    log(`== 提交完成：${submitted} 个（缺关键帧 ${noKf.length} 个跳过）==`);
  }

  // 轮询直到全部完成或超时（12h）
  const deadline = Date.now() + 12 * 3600 * 1000;
  let lastReport = 0;
  while (Date.now() < deadline) {
    await sleep(120000);
    const pending = db.prepare("SELECT COUNT(*) n FROM shot_video_intervals WHERE status IN ('pending','processing') AND shot_id IN (SELECT id FROM shots WHERE episode_id='ep_4b6d11ae648c4072')").get().n;
    const completed = db.prepare("SELECT COUNT(*) n FROM shot_video_intervals WHERE status='completed' AND shot_id IN (SELECT id FROM shots WHERE episode_id='ep_4b6d11ae648c4072')").get().n;
    if (Date.now() - lastReport > 600000 || pending === 0) {
      log(`轮询: 进行中 ${pending}，完成 ${completed} / ${jobs.length}`);
      lastReport = Date.now();
    }
    if (pending === 0) { log('== 全部视频任务已结束 =='); break; }
  }
  db.close();
}

main().catch(e => { log('FATAL: ' + e.message); process.exit(1); });
