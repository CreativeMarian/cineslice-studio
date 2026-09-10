const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db');
const rows = db.prepare("SELECT id, created_at FROM shot_keyframes WHERE shot_id='shot_d7e95e2ad971d768' AND frame_type='last' ORDER BY created_at DESC").all();
if (rows.length > 1) {
  for (let i = 1; i < rows.length; i++) db.prepare('DELETE FROM shot_keyframes WHERE id=?').run(rows[i].id);
  console.log('cleaned dup last:', rows.length - 1);
} else console.log('no dup');
