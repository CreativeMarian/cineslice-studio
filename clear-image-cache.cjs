const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db');
const dist = db.prepare("SELECT model_type, COUNT(*) n FROM ai_cache GROUP BY model_type").all();
console.log('model_type dist:', dist);
const r = db.prepare("DELETE FROM ai_cache WHERE model_type='image'").run();
console.log('deleted image caches:', r.changes);
