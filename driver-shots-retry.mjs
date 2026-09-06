// 重跑失败集：E21 / E31 分镜
import fs from 'node:fs';

const RETRY = ['ep_867345690693f3ae', 'ep_3e067041cec2e6fd'];
const BASE = 'http://127.0.0.1:3000';
const LOG = 'data/pipeline-shots-retry.log';
const body = JSON.stringify({ textProvider: 'custom-openai', textModel: 'agnes-2.5-flash', shotDensity: 'normal', includeDialogue: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

for (const epId of RETRY) {
  const t0 = Date.now();
  log(`>>> 重跑 ${epId}`);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 590000);
    const resp = await fetch(`${BASE}/api/episodes/${epId}/shots/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const txt = await resp.text();
    log(resp.ok
      ? `<<< 成功 ${epId} (${Date.now() - t0}ms)`
      : `<<< 失败 ${epId} (${Date.now() - t0}ms) HTTP ${resp.status}: ${txt.substring(0, 200)}`);
  } catch (e) {
    log(`<<< 异常 ${epId} (${Date.now() - t0}ms): ${e.message}`);
  }
}
log('=== 重跑完成 ===');
