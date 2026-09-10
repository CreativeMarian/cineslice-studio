const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep1 = 'ep_9007ad738958ec66';
function stat() {
  const total = db.prepare('SELECT COUNT(*) c FROM shots WHERE episode_id=?').get(ep1).c;
  const first = db.prepare('SELECT COUNT(*) c FROM shot_keyframes k JOIN shots s ON k.shot_id=s.id WHERE s.episode_id=? AND k.frame_type=? AND k.image_url IS NOT NULL').get(ep1, 'first').c;
  const last = db.prepare('SELECT COUNT(*) c FROM shot_keyframes k JOIN shots s ON k.shot_id=s.id WHERE s.episode_id=? AND k.frame_type=? AND k.image_url IS NOT NULL').get(ep1, 'last').c;
  const active = db.prepare("SELECT COUNT(*) c FROM generation_tasks WHERE project_id='proj_e8b38508a04470e2' AND status IN ('pending','running')").get().c;
  console.log(new Date().toLocaleTimeString(), `first=${first}/${total} last=${last} active=${active}`);
}
(async () => {
  for (let i = 0; i < 14; i++) {
    stat();
    const total = db.prepare('SELECT COUNT(*) c FROM shots WHERE episode_id=?').get(ep1).c;
    const first = db.prepare('SELECT COUNT(*) c FROM shot_keyframes k JOIN shots s ON k.shot_id=s.id WHERE s.episode_id=? AND k.frame_type=? AND k.image_url IS NOT NULL').get(ep1, 'first').c;
    if (first >= total) { console.log('ALL FIRST DONE'); break; }
    await new Promise(r => setTimeout(r, 60000));
  }
  stat();
})();
