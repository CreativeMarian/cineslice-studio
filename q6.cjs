const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep = 'ep_4808b447a0c116c2';
const s = db.prepare("SELECT v.status,COUNT(*) c, COUNT(DISTINCT v.external_task_id) t FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=? GROUP BY v.status").all(ep);
for (const r of s) console.log(r.status, '|', r.c, '| tasks:', r.t);
const miss = db.prepare("SELECT s.shot_number FROM shots s WHERE s.episode_id=? AND NOT EXISTS (SELECT 1 FROM shot_video_intervals v WHERE v.shot_id=s.id AND v.external_task_id IS NOT NULL AND v.external_task_id!='') ORDER BY s.shot_number").all(ep);
console.log('no-task shots:', miss.map(m=>m.shot_number).join(',') || 'none');
