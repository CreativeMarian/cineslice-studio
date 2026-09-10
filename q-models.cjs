const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const cols = db.prepare("PRAGMA table_info(model_registry)").all();
console.log('cols:', cols.map(c => c.name).join(','));
const m = db.prepare('SELECT * FROM model_registry').all();
console.log('count:', m.length);
for (const r of m) {
  const key = r.api_key ? String(r.api_key).slice(0, 12) + '...' : '(none)';
  console.log('-', String(r.provider).slice(0, 22), '|', String(r.model_name).slice(0, 34), '| key:', key, '| ep:', String(r.endpoint_url || '').slice(0, 44));
}
