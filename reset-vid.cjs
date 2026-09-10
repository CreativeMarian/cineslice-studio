const db = require('better-sqlite3')('data/cineslice-studio.db');
const r = db.prepare("UPDATE shot_video_intervals SET status='failed', error_message='interrupted-batch-reset' WHERE shot_id IN (SELECT id FROM shots WHERE episode_id='ep_9007ad738958ec66') AND status='pending'").run();
console.log('reset pending->failed:', r.changes);
const s = db.prepare("SELECT v.status,COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id='ep_9007ad738958ec66' GROUP BY v.status").all();
console.log(JSON.stringify(s));
