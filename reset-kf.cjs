const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db');
const shotIds = db.prepare("SELECT id FROM shots WHERE episode_id='ep_40c5ae5e1f55f052'").all().map(r => r.id);
console.log('shots:', shotIds.length);
const r1 = db.prepare(`DELETE FROM shot_keyframes WHERE shot_id IN (${shotIds.map(() => '?').join(',')})`).run(...shotIds);
console.log('deleted keyframes:', r1.changes);
const r2 = db.prepare(`UPDATE shot_video_intervals SET status='failed', error_message='regenerating keyframes' WHERE shot_id IN (${shotIds.map(() => '?').join(',')}) AND status IN ('processing','pending')`).run(...shotIds);
console.log('cancelled videos:', r2.changes);
const r3 = db.prepare(`UPDATE shot_video_intervals SET status='failed', error_message='superseded by new keyframes' WHERE shot_id IN (${shotIds.map(() => '?').join(',')}) AND status='completed'`).run(...shotIds);
console.log('marked old completed videos failed:', r3.changes);
