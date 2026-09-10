const db = require('better-sqlite3')('data/cineslice-studio.db');
const fs = require('fs');
const rows = db.prepare("SELECT s.shot_number, v.video_url, v.completed_at FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id='ep_9007ad738958ec66' AND v.status='completed' ORDER BY s.shot_number").all();
for (const r of rows) {
  const p = r.video_url ? r.video_url.replace(/^\/data\//, 'E:/Demo/MOO/data/') : '';
  const exists = p ? fs.existsSync(p) : false;
  let size = 0;
  if (exists) size = fs.statSync(p).size;
  console.log('shot', r.shot_number, '| exists:', exists, '| size:', size, '|', r.completed_at);
}
