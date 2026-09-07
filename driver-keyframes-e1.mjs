// 批量关键帧（agnes 通道，限速退避）— 仅 E1
import fs from 'node:fs';
import Database from 'better-sqlite3';

const EPISODES = ['ep_4b6d11ae648c4072'];
const BASE = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-keyframes-e1.log';
const PROVIDER = 'custom-openai';
const MODEL = 'agnes-image-2.1-flash';
const db = new Database('data/cineslice-studio.db', { readonly: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function genKeyframe(shotId, attempt) {
  const body = JSON.stringify({ provider: PROVIDER, modelName: MODEL, frameTypes: ['first'] });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 170000);
  try {
    const resp = await fetch(`${BASE}/api/shots/${shotId}/keyframes/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const txt = await resp.text();
    if (resp.status === 429) {
      log(`  限流(429) ${shotId}，等待 60s 后重试`);
      return 'rate';
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${txt.substring(0, 150)}`);
    return 'ok';
  } catch (e) {
    clearTimeout(timer);
    log(`  第${attempt}次失败 ${shotId}: ${e.message}`);
    return 'fail';
  }
}

(async () => {
  for (const epId of EPISODES) {
    const shots = db.prepare('SELECT id, shot_number FROM shots WHERE episode_id = ? ORDER BY shot_number').all(epId);
    let existing = 0, created = 0, failed = 0;
    const have = new Set(db.prepare("SELECT shot_id FROM shot_keyframes WHERE frame_type='first' AND image_url IS NOT NULL AND image_url != ''").all().map(r => r.shot_id));
    log(`>>> 关键帧 ${epId} 共 ${shots.length} 镜，已有 ${shots.filter(s => have.has(s.id)).length} 镜`);
    for (const s of shots) {
      if (have.has(s.id)) { existing++; continue; }
      let r1 = await genKeyframe(s.id, 1);
      if (r1 === 'ok') { created++; }
      else {
        if (r1 === 'rate') { await sleep(60000); r1 = await genKeyframe(s.id, 2); }
        else await sleep(15000);
        if (r1 === 'ok') created++;
        else {
          if (r1 === 'rate') { await sleep(60000); r1 = await genKeyframe(s.id, 3); if (r1 === 'ok') created++; else failed++; }
          else failed++;
        }
      }
      await sleep(15000); // 限速：每次请求间隔 15s
      if ((created + failed) % 5 === 0) log(`  ...${epId} 完成 ${created + existing}/${shots.length} (新建${created})`);
    }
    log(`<<< 关键帧 ${epId} 完成: 已有${existing} 新建${created} 失败${failed}`);
  }
  log('=== E1 关键帧完成 ===');
  db.close();
})();
