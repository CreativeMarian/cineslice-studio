const db = require('better-sqlite3')('data/cineslice-studio.db');
const rows = db.prepare("SELECT id, provider, model_name, model_type, is_active, is_default FROM model_registry WHERE model_type='video' ORDER BY is_default DESC").all();
for (const r of rows) console.log(r.id, '|', r.provider, '|', r.model_name, '|', r.is_active ? 'on' : 'off', '|', r.is_default === 1 ? 'DEFAULT' : '');
