const db = require('better-sqlite3')('data/cineslice-studio.db');
const rows = db.prepare("SELECT s.shot_number, v.status, substr(v.external_task_id,1,20) t, substr(v.error_message,1,40) e, v.created_at FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id='ep_9007ad738958ec66' ORDER BY v.created_at DESC LIMIT 12").all();
for (const r of rows) console.log(r.shot_number, r.status, '|', r.t || '', '|', (r.e || ''), '|', r.created_at);
