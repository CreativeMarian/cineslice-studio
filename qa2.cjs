const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep = 'ep_9007ad738958ec66';
const rows = db.prepare("SELECT s.shot_number, s.action_description, s.dialogue, s.characters_in_shot, a.id as audio_id, a.file_name FROM shots s LEFT JOIN shot_audio a ON a.shot_id=s.id WHERE s.episode_id=? ORDER BY s.shot_number").all(ep);
for (const r of rows) {
  const act = (r.action_description || '').replace(/\s+/g, ' ').slice(0, 40);
  const dlg = (r.dialogue || '').replace(/\s+/g, ' ').slice(0, 50);
  const has = r.audio_id ? `AUDIO:${(r.file_name||'').slice(0,24)}` : '-----';
  console.log(`#${String(r.shot_number).padStart(2)} [${has}] 镜头:${act} | 台词:${dlg}`);
}
