const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const r = db.prepare("SELECT shot_id, frame_type, image_url FROM shot_keyframes WHERE shot_id IN (SELECT id FROM shots WHERE episode_id='ep_40c5ae5e1f55f052') ORDER BY shot_id, frame_type").all();
const m = {};
r.forEach(x => { m[x.shot_id] = m[x.shot_id] || []; m[x.shot_id].push(x.frame_type); });
Object.keys(m).forEach(k => console.log(k.slice(-10), m[k].join(',')));
console.log('total keyframes:', r.length);
