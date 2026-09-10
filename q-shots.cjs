const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const shots = db.prepare("SELECT id, shot_number, duration_seconds, phase, use_next_first_frame FROM shots WHERE episode_id='ep_40c5ae5e1f55f052' ORDER BY shot_number LIMIT 16").all();
console.log('total shots:', shots.length);
for (const s of shots) {
  console.log(`#${s.shot_number} ${s.id} dur=${s.duration_seconds}s phase=${s.phase} next_first=${s.use_next_first_frame}`);
}
const first10 = shots.slice(0, 10).map(s => s.id);
console.log('FIRST10:', JSON.stringify(first10));
