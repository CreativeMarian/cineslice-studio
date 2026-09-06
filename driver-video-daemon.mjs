// driver-video-daemon.mjs — 后台守护：轮询视频任务 → 阶段合成 → 整集合成
// 每 120s：刷新 processing 视频状态；每集每阶段视频全部结束后触发阶段 compose；全阶段完成后触发整集 compose
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const API = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-videos.log';
const TRIGGER_FILE = 'data/daemon-triggered.json';
const EPISODES = ['ep_4b6d11ae648c4072', 'ep_18949d7acef23797', 'ep_616c947d8c961ac4',
  'ep_9c3aca88e739293e', 'ep_867345690693f3ae', 'ep_056f23c717c51c42', 'ep_3e067041cec2e6fd'];

// 已触发标记（防重复触发；重启后从文件恢复）
let triggered = new Set();
try { triggered = new Set(JSON.parse(fs.readFileSync(TRIGGER_FILE, 'utf-8'))); } catch {}

function markTriggered(key) {
  triggered.add(key);
  fs.writeFileSync(TRIGGER_FILE, JSON.stringify([...triggered]), 'utf-8');
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, opts);
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json).substring(0, 200)}`);
  return json;
}

async function refreshProcessing() {
  // 找所有 processing 视频并刷新状态
  let rows = [];
  const D = require('better-sqlite3');
  const db = new D('data/cineslice-studio.db', { readonly: true });
  rows = db.prepare("SELECT id, external_task_id, video_model_used FROM shot_video_intervals WHERE status IN ('pending','processing') AND external_task_id IS NOT NULL").all();
  db.close();
  for (const r of rows) {
    try {
      const st = await api(`/api/videos/${r.id}/status`);
      const s = st.data.status;
      if (s === 'completed') log(`[守护] 视频完成 ${r.id} url=${st.data.video_url}`);
      else if (s === 'failed') log(`[守护] 视频失败 ${r.id}: ${st.data.error_message}`);
    } catch (e) { /* 单条失败忽略 */ }
  }
  return rows.length;
}

async function tryCompose() {
  const D = require('better-sqlite3');
  const db = new D('data/cineslice-studio.db', { readonly: true });
  for (const epId of EPISODES) {
    const shots = db.prepare("SELECT id, phase FROM shots WHERE episode_id=? ORDER BY shot_number").all(epId);
    if (!shots.length) continue;
    const phases = [...new Set(shots.map(s => s.phase ?? 'default'))].filter(p => p !== null && p !== 'default').sort();
    const usePhases = phases.length ? phases : ['default'];
    for (const phase of usePhases) {
      const phaseShots = shots.filter(s => (s.phase ?? 'default') === phase);
      if (!phaseShots.length) continue;
      // 该阶段：有视频记录才算参与合成
      const videos = db.prepare(
        "SELECT id, status FROM shot_video_intervals WHERE shot_id IN (" +
        phaseShots.map(() => '?').join(',') + ")"
      ).all(...phaseShots.map(s => s.id));
      if (!videos.length) continue;
      const finished = videos.filter(v => v.status === 'completed');
      const processing = videos.filter(v => v.status === 'pending' || v.status === 'processing');
      if (processing.length === 0 && finished.length > 0) {
        const pNum = phase === 'default' ? 1 : Number(phase);
        const tKey = `phase|${epId}|${pNum}`;
        if (triggered.has(tKey)) continue;
        try {
          const r = await api(`/api/episodes/${epId}/compose`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phase: pNum, byPhase: true }),
          });
          log(`[守护] 阶段合成已触发 ep=${epId} phase=${pNum} clips=${finished.length} task=${r.data.taskId}`);
          markTriggered(tKey);
        } catch (e) { log(`[守护] 阶段合成失败 ep=${epId} phase=${pNum}: ${e.message}`); }
      }
    }
  }
  db.close();
}

async function main() {
  log('[守护] 视频守护进程启动');
  while (true) {
    try {
      const processingCount = await refreshProcessing();
      await tryCompose();
      // 查询 compose 状态并尝试整集合成
      try {
        const D = require('better-sqlite3');
        const db = new D('data/cineslice-studio.db', { readonly: true });
        for (const epId of EPISODES) {
          const total = db.prepare("SELECT COUNT(*) c FROM shots WHERE episode_id=?").get(epId).c;
          const completedVideos = db.prepare(
            "SELECT COUNT(DISTINCT s.id) c FROM shots s JOIN shot_video_intervals v ON v.shot_id=s.id WHERE s.episode_id=? AND v.status='completed'"
          ).get(epId).c;
          if (total > 0 && completedVideos === total) {
            // 每镜都有视频 → 整集合成
            const tKey = `episode|${epId}`;
            if (triggered.has(tKey)) continue;
            const r = await api(`/api/episodes/${epId}/compose`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ byPhase: true }),
            });
            log(`[守护] 整集合成已触发 ep=${epId} task=${r.data.taskId}`);
            markTriggered(tKey);
          }
        }
        db.close();
      } catch (e) { /* 整集合成探测失败忽略 */ }
      if (processingCount === 0) log('[守护] 当前无 processing 视频');
    } catch (e) {
      log(`[守护] 轮询异常: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 120000));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
