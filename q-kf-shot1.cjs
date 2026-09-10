const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const k = db.prepare("SELECT frame_type, image_url, prompt FROM shot_keyframes WHERE shot_id='shot_d7e95e2ad971d768' ORDER BY frame_type").all();
k.forEach(r => console.log(r.frame_type, '|', r.image_url, '\n   prompt:', (r.prompt || '').slice(0, 220), '\n'));
