const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep = 'ep_4808b447a0c116c2';
const total = db.prepare("SELECT COUNT(*) c FROM shots WHERE episode_id=?").get(ep).c;
const kf = db.prepare("SELECT COUNT(DISTINCT sk.shot_id) c FROM shot_keyframes sk JOIN shots s ON sk.shot_id=s.id WHERE s.episode_id=? AND sk.frame_type='first'").get(ep).c;
console.log('shots:', total, 'first-frames:', kf);
const miss = db.prepare("SELECT s.shot_number FROM shots s WHERE s.episode_id=? AND NOT EXISTS (SELECT 1 FROM shot_keyframes sk WHERE sk.shot_id=s.id AND sk.frame_type='first') ORDER BY s.shot_number").all(ep);
console.log('missing:', miss.map(m=>m.shot_number).join(',') || 'none');
