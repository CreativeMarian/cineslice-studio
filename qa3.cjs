const db = require('better-sqlite3')('data/cineslice-studio.db');
const rows = db.prepare("SELECT shot_number, file_name, status, duration_seconds FROM shot_audio WHERE episode_id=? ORDER BY shot_number").all('ep_9007ad738958ec66');
for (const r of rows) console.log('#' + r.shot_number, r.status, r.duration_seconds + 's', r.file_name);
