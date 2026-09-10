const db = require('better-sqlite3')('data/cineslice-studio.db');
const s = db.prepare("SELECT s.shot_number, v.status, v.error_message, v.external_task_id FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id='ep_9007ad738958ec66' ORDER BY s.shot_number LIMIT 32").all();
for (const r of s) console.log(r.shot_number, r.status, (r.error_message||'').slice(0,50), r.external_task_id ? 'task=' + r.external_task_id.slice(0,12) : '');
