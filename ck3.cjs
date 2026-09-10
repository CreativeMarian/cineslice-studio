const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep = 'ep_4808b447a0c116c2';
const rows = db.prepare("SELECT s.shot_number, sk.frame_type, substr(sk.image_url,1,55) u, sk.created_at FROM shot_keyframes sk JOIN shots s ON sk.shot_id=s.id WHERE s.episode_id=? ORDER BY s.shot_number LIMIT 10").all(ep);
for (const r of rows) console.log(r.shot_number, '|', r.frame_type, '|', (r.u||''), '|', r.created_at);
const c = db.prepare("SELECT COUNT(*) c FROM shot_keyframes sk JOIN shots s ON sk.shot_id=s.id WHERE s.episode_id=?").get(ep).c;
console.log("total kf rows:", c);
const miss = db.prepare("SELECT s.shot_number FROM shots s WHERE s.episode_id=? AND NOT EXISTS (SELECT 1 FROM shot_keyframes sk WHERE sk.shot_id=s.id AND sk.frame_type='first' AND sk.image_url IS NOT NULL AND sk.image_url != '') ORDER BY s.shot_number").all(ep);
console.log("missing:", miss.map(m=>m.shot_number).join(',') || 'none');
