const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const k = db.prepare("SELECT id, shot_id, frame_type, image_url, image_model_used, created_at FROM shot_keyframes WHERE shot_id='shot_d7e95e2ad971d768'").all();
console.log(JSON.stringify(k, null, 1));
