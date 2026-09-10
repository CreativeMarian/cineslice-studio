const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep1 = 'ep_9007ad738958ec66';
function stat() {
  const s = db.prepare("SELECT v.status,COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=? AND v.video_model_used LIKE 'comfyui/%' GROUP BY v.status").all(ep1);
  console.log(new Date().toLocaleTimeString(), JSON.stringify(s));
}
(async () => {
  for (let i = 0; i < 40; i++) {
    stat();
    const done = db.prepare("SELECT COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=? AND v.video_model_used LIKE 'comfyui/%' AND v.status='completed'").get(ep1).c;
    const fail = db.prepare("SELECT COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id=? AND v.video_model_used LIKE 'comfyui/%' AND v.status='failed'").get(ep1).c;
    if (done + fail >= 30) { console.log('ALL SETTLED done=' + done + ' fail=' + fail); break; }
    await new Promise(r => setTimeout(r, 90000));
  }
  stat();
})();
