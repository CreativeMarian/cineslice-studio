const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const v = db.prepare("SELECT shot_id, video_url, video_model_used, duration_seconds, external_task_id, created_at, completed_at FROM shot_video_intervals WHERE shot_id='shot_d7e95e2ad971d768' ORDER BY rowid DESC LIMIT 3").all();
console.log(JSON.stringify(v, null, 1));
const p = db.prepare("SELECT id, shot_id, frame_type, image_url FROM shot_keyframes WHERE shot_id='shot_d7e95e2ad971d768' ORDER BY frame_type").all();
console.log('keyframes:', JSON.stringify(p.map(k => ({ f: k.frame_type, url: k.image_url })), null, 1));
