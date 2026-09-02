// 统一旧风格预设的分类和参数格式
// 将旧的6个预设（sp_开头）的 category 统一为中文，video_params 添加 suitableFor

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'moo-director.db');
const db = new Database(dbPath);

// 旧预设的分类映射和 suitableFor
const oldPresetUpdates = [
  {
    id: 'sp_guxian',
    name: '古风仙侠',
    newCategory: '国风',
    suitableFor: ['古风', '仙侠', '奇幻', '武侠', '爱情'],
  },
  {
    id: 'sp_dushi',
    name: '现代都市',
    newCategory: '写实',
    suitableFor: ['都市', '现代', '爱情', '职场', '现实主义'],
  },
  {
    id: 'sp_cyberpunk',
    name: '赛博朋克（经典）',
    newCategory: '科幻',
    suitableFor: ['赛博朋克', '科幻', '动作', '反乌托邦', '未来'],
  },
  {
    id: 'sp_xuanyi',
    name: '悬疑推理',
    newCategory: '暗黑',
    suitableFor: ['悬疑', '推理', '犯罪', '侦探', '惊悚'],
  },
  {
    id: 'sp_tianchong',
    name: '甜宠恋爱',
    newCategory: '治愈',
    suitableFor: ['甜宠', '恋爱', '爱情', '青春', '日常'],
  },
  {
    id: 'sp_rexue',
    name: '热血战斗',
    newCategory: '青春',
    suitableFor: ['热血', '战斗', '动作', '青春', '励志'],
  },
];

console.log('开始统一旧风格预设...\n');

let updated = 0;
for (const preset of oldPresetUpdates) {
  const existing = db.prepare('SELECT id, category, video_params FROM style_presets WHERE id = ?').get(preset.id);
  if (!existing) {
    console.log(`  跳过 ${preset.name}（不存在）`);
    continue;
  }

  // 解析现有 video_params
  let videoParams = {};
  try {
    videoParams = JSON.parse(existing.video_params || '{}');
  } catch {
    videoParams = {};
  }

  // 添加 suitableFor
  videoParams.suitableFor = preset.suitableFor;

  // 更新 category 和 video_params，同时更新 name（赛博朋克加"经典"区分）
  db.prepare('UPDATE style_presets SET category = ?, video_params = ?, name = ?, updated_at = ? WHERE id = ?')
    .run(
      preset.newCategory,
      JSON.stringify(videoParams),
      preset.name,
      new Date().toISOString(),
      preset.id
    );

  console.log(`  ✅ ${preset.name}: category ${existing.category} → ${preset.newCategory}`);
  updated++;
}

console.log(`\n完成！统一了 ${updated} 个旧风格预设`);

// 统计最终分类
console.log('\n=== 最终风格预设统计 ===');
const allPresets = db.prepare('SELECT category, COUNT(*) as cnt FROM style_presets GROUP BY category ORDER BY cnt DESC').all();
for (const cat of allPresets) {
  console.log(`  ${cat.category}: ${cat.cnt} 个`);
}
const total = db.prepare('SELECT COUNT(*) as cnt FROM style_presets').get();
console.log(`  总计: ${total.cnt} 个`);

db.close();
