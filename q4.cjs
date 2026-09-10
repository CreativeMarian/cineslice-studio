const db = require('better-sqlite3')('data/cineslice-studio.db');
// 查看 video_model_used 分布
const s = db.prepare("SELECT v.video_model_used, v.status, COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id='ep_9007ad738958ec66' GROUP BY v.video_model_used, v.status").all();
for (const r of s) console.log(r.video_model_used, '|', r.status, '|', r.c);
