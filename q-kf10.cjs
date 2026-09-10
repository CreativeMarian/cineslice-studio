const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const k = db.prepare("SELECT shot_id, frame_type, COUNT(*) c FROM shot_keyframes WHERE shot_id IN (SELECT id FROM shots WHERE episode_id='ep_40c5ae5e1f55f052') GROUP BY shot_id, frame_type ORDER BY shot_id").all();
console.log('keyframes so far:', k.length);
for (const r of k) console.log(r.shot_id.slice(-8), r.frame_type, 'x' + r.c);
const total = db.prepare("SELECT COUNT(*) c FROM shot_keyframes WHERE shot_id IN (SELECT id FROM shots WHERE episode_id='ep_40c5ae5e1f55f052')").get();
console.log('total frames:', total.c, '/ 20 (10 shots x 2)');
