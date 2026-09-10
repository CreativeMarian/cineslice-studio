const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const shots = db.prepare("SELECT shot_number, id, dialogue, action_description FROM shots WHERE episode_id='ep_40c5ae5e1f55f052' ORDER BY shot_number LIMIT 10").all();
shots.forEach(s => {
  const d = (s.dialogue || '').replace(/\s+/g, ' ').slice(0, 100);
  console.log(`镜${s.shot_number} ${s.id.slice(-10)} 台词: ${d || '(无)'}`);
});
