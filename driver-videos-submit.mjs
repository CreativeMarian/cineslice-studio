// driver-videos-submit.mjs — 提交全部剧集×阶段代表镜头视频任务到 ComfyUI 队列
import fs from 'fs';

const API = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-videos.log';
const EPISODES = [
  ['ep_4b6d11ae648c4072', 'E1'], ['ep_18949d7acef23797', 'E6'], ['ep_616c947d8c961ac4', 'E11'],
  ['ep_9c3aca88e739293e', 'E16'], ['ep_867345690693f3ae', 'E21'], ['ep_056f23c717c51c42', 'E26'],
  ['ep_3e067041cec2e6fd', 'E31'],
];

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

async function main() {
  const jobs = [];
  for (const [epId, label] of EPISODES) {
    const shots = (await api(`/api/episodes/${epId}/shots`)).data || [];
    if (!shots.length) { log(`${label}: 无分镜`); continue; }
    const groups = new Map();
    for (const s of shots) {
      const key = s.phase || s.phase_name || 'default';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    for (const [phase, list] of groups) {
      list.sort((a, b) => (a.shot_number || 0) - (b.shot_number || 0));
      const shot = list[0];
      jobs.push({ epId, label, phase, shotId: shot.id, shotNumber: shot.shot_number });
    }
  }
  log(`计划提交 ${jobs.length} 个阶段代表镜头视频任务`);
  for (const j of jobs) {
    const body = { provider: 'comfyui', modelName: 'minimax-h3-video.json', duration: 5, ratio: '16:9' };
    try {
      const r = await api(`/api/shots/${j.shotId}/video/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      log(`已提交 ${j.label} 阶段${j.phase} 镜头${j.shotNumber} -> vid=${r.data && r.data.id} ext=${r.data && r.data.external_task_id}`);
    } catch (e) {
      log(`提交失败 ${j.label} 阶段${j.phase} 镜头${j.shotNumber}: ${e.message}`);
    }
  }
  log('提交阶段完成');
}

main().catch(e => { console.error(e); process.exit(1); });
