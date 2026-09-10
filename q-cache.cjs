const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db');
const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%cache%'").all();
console.log('cache tables:', t.map(x => x.name));
if (t.length) {
  const name = t[0].name;
  const c = db.prepare(`PRAGMA table_info(${name})`).all();
  console.log('cols:', c.map(x => x.name).join(','));
  const cnt = db.prepare(`SELECT COUNT(*) n FROM ${name}`).get();
  console.log('rows:', cnt.n);
  const s = db.prepare(`SELECT * FROM ${name} LIMIT 3`).all();
  console.log('sample:', JSON.stringify(s).slice(0, 500));
}
