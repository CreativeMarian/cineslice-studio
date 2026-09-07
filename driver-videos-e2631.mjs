// 提交 E26 + E31 全镜头视频（ref2va 图生视频）
import fs from 'fs';
import Database from 'better-sqlite3';
const API = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-videos-e2631.log';
const EPISODES = ['ep_056f23c717c51c42', 'ep_3e067041cec2e6fd'];
const db = new Database('data/cineslice-studio.db', { readonly: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  let submitted = 0, skip = 0;
  for (const epId of EPISODES) {
    const shots = db.prepare('SELECT id, shot_number FROM shots WHERE episode_id = ? ORDER BY shot_number').all(epId);
    for (const s of shots) {
      const done = db.prepare("SELECT id FROM shot_video_intervals WHERE shot_id=? AND status='completed'").get(s.id);
      if (done) { skip++; continue; }
      const kf = db.prepare("SELECT id FROM shot_keyframes WHERE shot_id=? AND frame_type='first' AND image_url IS NOT NULL AND image_url != '' ORDER BY created_at DESC LIMIT 1").get(s.id);
      if (!kf) { log(`  ${epId} 镜头${s.shot_number} 无关键帧，跳过`); skip++; continue; }
      const body = { provider: 'comfyui', modelName: 'minimax-h3-video.json', keyframeId: kf.id, duration: 5, ratio: '16:9', resolution: '720p' };
      try {
        const r = await fetch(`${API}/api/shots/${s.id}/video/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(j).substring(0, 150));
        submitted++;
      } catch (e) {
        log(`  提交失败 ${epId} 镜头${s.shot_number}: ${e.message}`);
      }
      await sleep(1500);
    }
    log(`<<< ${epId} 提交完成（累计 ${submitted}，跳过 ${skip}）`);
  }
  log(`== 提交结束：${submitted} 个新任务 ==`);
  db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
