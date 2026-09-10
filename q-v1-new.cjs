const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const v = db.prepare("SELECT video_url, completed_at FROM shot_video_intervals WHERE shot_id='shot_d7e95e2ad971d768' AND status='completed' ORDER BY completed_at DESC LIMIT 1").get();
console.log(JSON.stringify(v, null, 1));
