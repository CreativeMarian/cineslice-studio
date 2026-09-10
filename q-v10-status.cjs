const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const r = db.prepare("SELECT shot_id, status, video_url FROM shot_video_intervals WHERE shot_id IN (SELECT id FROM shots WHERE episode_id='ep_40c5ae5e1f55f052') ORDER BY created_at DESC LIMIT 10").all();
r.forEach(x => console.log(x.shot_id.slice(-10), x.status, '|', x.video_url || ''));
