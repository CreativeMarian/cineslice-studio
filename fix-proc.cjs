const db = require('better-sqlite3')('data/cineslice-studio.db');
// 有 external_task_id 且 failed 的（误标），改回 processing 让 poller 继续轮询
const r = db.prepare("UPDATE shot_video_intervals SET status='processing', error_message=NULL WHERE shot_id IN (SELECT id FROM shots WHERE episode_id='ep_9007ad738958ec66') AND status='failed' AND external_task_id IS NOT NULL AND external_task_id != ''").run();
console.log('failed->processing:', r.changes);
const s = db.prepare("SELECT v.status,COUNT(*) c FROM shot_video_intervals v JOIN shots s ON v.shot_id=s.id WHERE s.episode_id='ep_9007ad738958ec66' GROUP BY v.status").all();
console.log(JSON.stringify(s));
