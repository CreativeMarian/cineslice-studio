const db = require('better-sqlite3')('data/cineslice-studio.db');
const rows = db.prepare("SELECT s.shot_number, (SELECT COUNT(*) FROM shot_keyframes k WHERE k.shot_id=s.id AND k.frame_type='first' AND k.image_url IS NOT NULL) f FROM shots s WHERE s.episode_id='ep_9007ad738958ec66' ORDER BY s.shot_number").all();
const miss = rows.filter(x => x.f === 0).map(x => x.shot_number);
console.log('missing:', miss.join(','), 'count:', miss.length);
