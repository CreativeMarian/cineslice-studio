const D = require('better-sqlite3');
const db = new D('data/cineslice-studio.db');
const rows = db.prepare(`SELECT v.id, v.shot_id, s.shot_number, v.created_at, substr(v.video_url,1,60) url
  FROM shot_video_intervals v JOIN shots s ON s.id=v.shot_id
  WHERE v.status='completed' AND s.episode_id='ep_4b6d11ae648c4072' ORDER BY s.shot_number`).all();
console.log('E1 completed:', rows.length);
for (const r of rows) console.log(JSON.stringify(r));
db.close();
