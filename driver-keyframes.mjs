// 全剧本关键帧驱动：逐镜生成首帧，已有 first 帧跳过，失败重试1次
import fs from 'node:fs';
import Database from 'better-sqlite3';

const EPISODES = [
  'ep_4b6d11ae648c4072', 'ep_18949d7acef23797', 'ep_616c947d8c961ac4',
  'ep_9c3aca88e739293e', 'ep_867345690693f3ae', 'ep_056f23c717c51c42',
  'ep_3e067041cec2e6fd',
];
const BASE = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-keyframes.log';
const PROVIDER = 'doubao-image';
const MODEL = 'doubao-seedream-5-0-pro-260628';
const db = new Database('data/cineslice-studio.db', { readonly: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

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
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${txt.substring(0, 150)}`);
    return true;
  } catch (e) {
    clearTimeout(timer);
    log(`  第${attempt}次失败 ${shotId}: ${e.message}`);
    return false;
  }
}

for (const epId of EPISODES) {
  const shots = db.prepare('SELECT id, shot_number FROM shots WHERE episode_id = ? ORDER BY shot_number').all(epId);
  let existing = 0, created = 0, failed = 0;
  const have = new Set(db.prepare("SELECT shot_id FROM shot_keyframes WHERE frame_type='first' AND image_url IS NOT NULL AND image_url != ''").all().map(r => r.shot_id));
  log(`>>> 关键帧 ${epId} 共 ${shots.length} 镜，已有 ${shots.filter(s => have.has(s.id)).length} 镜`);
  for (const s of shots) {
    if (have.has(s.id)) { existing++; continue; }
    let ok = await genKeyframe(s.id, 1);
    if (!ok) ok = await genKeyframe(s.id, 2);
    if (ok) created++; else failed++;
    if ((created + failed) % 5 === 0) log(`  ...${epId} 完成 ${created + existing}/${shots.length} (新建${created})`);
  }
  log(`<<< 关键帧 ${epId} 完成: 已有${existing} 新建${created} 失败${failed}`);
}
log('=== 关键帧阶段完成 ===');
db.close();
