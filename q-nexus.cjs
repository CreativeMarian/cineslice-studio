const db = require('better-sqlite3')('E:/Demo/NexusLLMapi/data/store.db', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('tables:', tables.map(t => t.name).join(','));
try {
  const cols = db.prepare("PRAGMA table_info(models)").all();
  console.log('models cols:', cols.map(c => c.name).join(','));
  const m = db.prepare('SELECT * FROM models').all();
  console.log('models count:', m.length);
  for (const row of m.slice(0, 40)) {
    const name = row.model_id || row.name || row.model;
    const type = row.type || row.model_type || '';
    const channel = row.channel_id || row.channel_name || '';
    console.log('-', String(name).slice(0, 50), '|', String(type).slice(0, 20), '| ch:', String(channel).slice(0, 30));
  }
} catch (e) {
  console.log('models err:', e.message);
}
