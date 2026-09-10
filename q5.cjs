const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep1 = 'ep_9007ad738958ec66';
const s = db.prepare("SELECT v.status,COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=? AND v.video_model_used LIKE 'comfyui/%' GROUP BY v.status").all(ep1);
console.log(JSON.stringify(s));
const done = db.prepare("SELECT s.shot_number, v.completed_at, v.progress FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=? AND v.video_model_used LIKE 'comfyui/%' AND v.status='completed' ORDER BY s.shot_number").all(ep1);
for (const d of done) console.log('done shot', d.shot_number, d.completed_at, d.progress);
