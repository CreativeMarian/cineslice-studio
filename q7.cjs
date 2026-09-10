const db = require('better-sqlite3')('data/cineslice-studio.db');
const ep1 = 'ep_9007ad738958ec66', ep2 = 'ep_4808b447a0c116c2';
for (const [name, ep] of [['E1', ep1], ['E2', ep2]]) {
  const c = db.prepare("SELECT COUNT(*) c FROM shot_audio a JOIN shots s ON a.shot_id=s.id WHERE s.episode_id=?").get(ep).c;
  const withDialogue = db.prepare("SELECT COUNT(*) c FROM shots WHERE episode_id=? AND (dialogue IS NOT NULL AND dialogue != '')").get(ep).c;
  console.log(name, 'audio:', c, '/ shots:', db.prepare("SELECT COUNT(*) c FROM shots WHERE episode_id=?").get(ep).c, 'withDialogue:', withDialogue);
}
