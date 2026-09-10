const db = require('better-sqlite3')('data/cineslice-studio.db');
const r = db.prepare("UPDATE shot_video_intervals SET status='failed', error_message='old-agnes-link-disabled' WHERE video_model_used LIKE 'agnes/%' AND shot_id IN (SELECT id FROM shots WHERE episode_id='ep_9007ad738958ec66') AND status='processing'").run();
console.log('agnes processing->failed:', r.changes);
const s = db.prepare("SELECT v.video_model_used, v.status, COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id='ep_9007ad738958ec66' GROUP BY v.video_model_used, v.status").all();
for (const x of s) console.log(x.video_model_used, '|', x.status, '|', x.c);
