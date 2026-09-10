// compose-watch.cjs - 等待第1集全部视频完成并自动拼接成片
const db = require('better-sqlite3')('data/cineslice-studio.db');
const fs = require('fs');
const path = require('path');

const EP = 'ep_9007ad738958ec66';
const LOG = 'data/compose-watch.log';
const API = 'http://127.0.0.1:3000/api';

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('zh-CN', {hour12:false})}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function getStatus() {
  const completed = db.prepare(
    `SELECT s.shot_number, v.video_url, v.status FROM shot_video_intervals v
     JOIN shots s ON v.shot_id=s.id
     WHERE s.episode_id=? AND v.status='completed'`
  ).all(EP);
  const doneNums = new Set(completed.map(r => r.shot_number));
  const shotCount = db.prepare(`SELECT COUNT(*) c FROM shots WHERE episode_id=?`).get(EP).c;
  const done = [];
  const missing = [];
  for (let i = 1; i <= shotCount; i++) {
    if (doneNums.has(i)) done.push(i); else missing.push(i);
  }
  // 视频文件存在性
  const filesOk = completed.filter(r => r.video_url).length;
  return { done, missing, shotCount, filesOk };
}

async function waitCompose() {
  // POST compose
  const res = await fetch(`${API}/episodes/${EP}/compose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transition: 'crossfade', transitionDuration: 0.5 }),
  });
  const j = await res.json();
  log(`[compose] status=${res.status} body=${JSON.stringify(j).slice(0, 500)}`);
  const data = j.data || {};
  const taskId = data.taskId || data.id;
  if (!taskId) {
    log('[compose] 无 taskId，尝试 latest-compose');
    return null;
  }
  // 轮询
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 15000));
    try {
      const r2 = await fetch(`${API}/compose/${taskId}`);
      const j2 = await r2.json();
      const st = j2.data || {};
      log(`[compose] poll#${i} status=${st.status} ${JSON.stringify(st).slice(0, 300)}`);
      if (st.status === 'completed' || st.status === 'success') {
        log(`[compose] DONE output=${st.outputPath || st.outputUrl || ''}`);
        return st;
      }
      if (st.status === 'failed') { log('[compose] FAILED'); return st; }
    } catch (e) { log(`[compose] poll err ${e.message}`); }
  }
  return null;
}

async function main() {
  log('=== compose-watch 启动 ===');
  // 首次检查：可能已完成
  for (let round = 0; round < 500; round++) {
    const st = getStatus();
    log(`检查: 完成 ${st.done.length}/${st.shotCount} 镜 (缺失: ${st.missing.slice(0,10).join(',') || '无'}) files=${st.filesOk}`);
    if (st.missing.length === 0 && st.done.length === st.shotCount) {
      log('全部视频完成，开始拼接');
      const result = await waitCompose();
      log('=== 拼接流程结束 ===');
      process.exit(0);
    }
    // 每 90s 查一次
    await new Promise(r => setTimeout(r, 90000));
  }
  log('超时(500轮)退出');
}

main().catch(e => { log('FATAL: ' + e.stack); process.exit(1); });
