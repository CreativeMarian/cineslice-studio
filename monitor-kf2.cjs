const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep1 = 'ep_9007ad738958ec66';
function firstCount() {
  return db.prepare("SELECT COUNT(*) c FROM shot_keyframes k JOIN shots s ON k.shot_id=s.id WHERE s.episode_id=? AND k.frame_type='first' AND k.image_url IS NOT NULL").get(ep1).c;
}
(async () => {
  for (let i = 0; i < 7; i++) {
    const f = firstCount();
    console.log(new Date().toLocaleTimeString(), 'first=' + f + '/30');
    if (f >= 30) { console.log('ALL FIRST DONE'); process.exit(0); }
    await new Promise(r => setTimeout(r, 75000));
  }
})();
