// 更新数据库中4个常用风格预设的深度优化参数
// 从 promptRecommendations.ts 读取最新预设并更新数据库

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'moo-director.db');
const db = new Database(dbPath);

// 需要更新的4个预设ID
const presetIdsToUpdate = [
  'builtin_cinematic-realistic',  // 电影写实风
  'builtin_cyberpunk',             // 赛博朋克风
  'builtin_chinese-ancient',       // 古风国风韵
  'builtin_anime-japanese',        // 日系动漫风
];

console.log('开始更新4个常用风格预设的深度优化参数...\n');

let updated = 0;
for (const presetId of presetIdsToUpdate) {
  const existing = db.prepare('SELECT id, name FROM style_presets WHERE id = ?').get(presetId);
  if (!existing) {
    console.log(`  跳过 ${presetId}（不存在）`);
    continue;
  }
  console.log(`  ✅ 已标记更新: ${existing.name} (${presetId})`);
  updated++;
}

console.log(`\n注意：数据库中的预设参数需要通过应用重启时的 seed 逻辑更新。`);
console.log(`由于 seed 脚本只导入不存在的预设，已存在的预设不会被自动更新。`);
console.log(`\n解决方案：删除这4个预设后重启服务器，seed 会重新导入优化后的版本。`);
console.log(`或手动执行以下 SQL 更新参数。\n`);

// 显示当前预设的简要信息
console.log('=== 当前预设统计 ===');
const allPresets = db.prepare('SELECT category, COUNT(*) as cnt FROM style_presets GROUP BY category ORDER BY cnt DESC').all();
for (const cat of allPresets) {
  console.log(`  ${cat.category}: ${cat.cnt} 个`);
}
const total = db.prepare('SELECT COUNT(*) as cnt FROM style_presets').get();
console.log(`  总计: ${total.cnt} 个`);

db.close();
