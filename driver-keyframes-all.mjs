// 批量关键帧（agnes 通道，限速退避）— 其余 6 集
import fs from 'node:fs';
import Database from 'better-sqlite3';

const EPISODES = ['ep_18949d7acef23797', 'ep_616c947d8c961ac4', 'ep_9c3aca88e739293e', 'ep_867345690693f3ae', 'ep_056f23c717c51c42', 'ep_3e067041cec2e6fd'];
const BASE = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-keyframes-all.log';
const PROVIDER = 'custom-openai';
const MODEL = 'agnes-image-2.1-flash';
const db = new Database('data/cineslice-studio.db', { readonly: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function genKeyframe(shotId) {
  const body = JSON.stringify({ provider: PROVIDER, modelName: MODEL, frameTypes: ['first'] });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 170000);
  try {
    const resp = await fetch(`${BASE}/api/shots/${shotId}/keyframes/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal,
    });
    clearTimeout(timer);
    const txt = await resp.text();
    if (resp.status === 429) return 'rate';
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${txt.substring(0, 120)}`);
    return 'ok';
  } catch (e) {
    clearTimeout(timer);
    log(`  失败 ${shotId}: ${e.message}`);
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
      let r1 = await genKeyframe(s.id);
      if (r1 === 'ok') created++;
      else if (r1 === 'rate') {
        await sleep(60000);
        const r2 = await genKeyframe(s.id);
        if (r2 === 'ok') created++;
        else if (r2 === 'rate') { await sleep(60000); const r3 = await genKeyframe(s.id); if (r3 === 'ok') created++; else failed++; }
        else failed++;
      } else {
        await sleep(15000);
        const r2 = await genKeyframe(s.id);
        if (r2 === 'ok') created++; else failed++;
      }
      await sleep(15000);
      if ((created + failed) % 10 === 0) log(`  ...${epId} ${created + existing}/${shots.length} (新建${created})`);
    }
    log(`<<< 关键帧 ${epId} 完成: 已有${existing} 新建${created} 失败${failed}`);
  }
  log('=== 全部关键帧完成 ===');
  db.close();
})();
