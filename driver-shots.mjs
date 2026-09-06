// 全剧本分镜驱动：7 集顺序生成分镜，缓存命中秒回，日志落盘
import fs from 'node:fs';

const EPISODES = [
  'ep_4b6d11ae648c4072',
  'ep_18949d7acef23797',
  'ep_616c947d8c961ac4',
  'ep_9c3aca88e739293e',
  'ep_867345690693f3ae',
  'ep_056f23c717c51c42',
  'ep_3e067041cec2e6fd',
];
const BASE = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-shots.log';
const body = JSON.stringify({ textProvider: 'custom-openai', textModel: 'agnes-2.5-flash', shotDensity: 'normal', includeDialogue: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

for (const epId of EPISODES) {
  const t0 = Date.now();
  log(`>>> 分镜生成开始 ${epId}`);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 330000);
    const resp = await fetch(`${BASE}/api/episodes/${epId}/shots/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const txt = await resp.text();
    if (resp.ok) {
      log(`<<< 分镜成功 ${epId} (${Date.now() - t0}ms)`);
    } else {
      log(`<<< 分镜失败 ${epId} (${Date.now() - t0}ms) HTTP ${resp.status}: ${txt.substring(0, 300)}`);
    }
  } catch (e) {
    log(`<<< 分镜异常 ${epId} (${Date.now() - t0}ms): ${e.message}`);
  }
}
log('=== 分镜阶段完成 ===');
