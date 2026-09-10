const db = require('better-sqlite3')('data/cineslice-studio.db');
const s = db.prepare("SELECT v.status,COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id='ep_9007ad738958ec66' GROUP BY v.status").all();
console.log(new Date().toLocaleTimeString(), JSON.stringify(s));
