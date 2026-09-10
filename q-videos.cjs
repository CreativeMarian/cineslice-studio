const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%video%'").all();
console.log('video tables:', tables.map(t => t.name).join(', '));
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`\n${t.name} cols:`, cols.map(c => c.name).join(','));
  const rows = db.prepare(`SELECT * FROM ${t.name} ORDER BY rowid DESC LIMIT 12`).all();
  for (const r of rows) {
    const s = r.shot_id || r.shotId || '';
    console.log('-', String(s).slice(-10), '|', r.status, '|', r.progress ?? r.progress_percent ?? '', '|', r.task_id || r.taskId || '');
  }
}
