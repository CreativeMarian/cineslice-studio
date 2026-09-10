const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep1 = 'ep_9007ad738958ec66';
function stat() {
  const s = db.prepare(`SELECT v.status, COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=? GROUP BY v.status`).all(ep1);
  const total = db.prepare("SELECT COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=?").get(ep1).c;
  console.log(new Date().toLocaleTimeString(), `videos=${total}`, JSON.stringify(s));
}
(async () => {
  for (let i = 0; i < 30; i++) {
    stat();
    const done = db.prepare("SELECT COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=? AND v.status='completed'").get(ep1).c;
    const total = db.prepare("SELECT COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=?").get(ep1).c;
    if (total > 0 && done >= total) { console.log('ALL VIDEOS DONE'); break; }
    await new Promise(r => setTimeout(r, 60000));
  }
  stat();
})();
