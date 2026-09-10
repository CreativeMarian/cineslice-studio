const db = require('better-sqlite3')('data/cineslice-studio.db');
const ec = db.prepare("PRAGMA table_info(novel_episodes)").all();
console.log("novel_episodes cols:", ec.map(c=>c.name).join(','));
const es = db.prepare("SELECT id, episode_number, title, status, stage, created_at FROM novel_episodes WHERE project_id='proj_e8b38508a04470e2' ORDER BY episode_number LIMIT 3").all();
for (const e of es) console.log(e.episode_number, '|', (e.title||'').slice(0,14), '|', e.status, '|', e.stage, '|', e.id);
const pc = db.prepare("PRAGMA table_info(projects)").all();
console.log("projects has metadata:", pc.map(c=>c.name).includes('metadata'));
const p = db.prepare("SELECT metadata FROM projects WHERE id='proj_e8b38508a04470e2'").get();
console.log("metadata:", (p && p.metadata || '').slice(0, 300));
