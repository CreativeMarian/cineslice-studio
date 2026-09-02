// 配置模型API Key到数据库
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'cineslice-studio.db');
const db = new Database(dbPath);

// API Key配置
const apiKeys = {
  // MiniMax API Key
  minimax: 'sk-cp-OqGFJ2Itb9O96F5DAF6mymHUMISpyCKxHfSCM5TzlV49HK0hlYoLKJmEge2B5c61Vwnflq8B_ssus3QNd4hHGfos-RB44MvKOkWNWsUEi0c0YbGgdTWxpsE',
  
  // DashScope API Key (用于 Wan 图像模型 和 HappyHorse 视频模型)
  dashscope: 'sk-ws-H.EYIMRLL.DpWu.MEQCIEZzAx-33nmoICf8wO49IaAmbuwaQ-IafcZ2vPnMfr0FAiAv3J3NgK1M8QV1NvqszXl9D_poeSe2uQ61K-jpGCZjmQ',
};

// 需要配置的模型列表
const modelsToConfigure = [
  // MiniMax 视频模型
  { provider: 'minimax', modelName: 'MiniMax-H3', apiKey: apiKeys.minimax, isActive: 1 },
  { provider: 'minimax', modelName: 'minimax-h3', apiKey: apiKeys.minimax, isActive: 1 },
  { provider: 'minimax', modelName: 'minimax-video-01', apiKey: apiKeys.minimax, isActive: 1 },
  
  // Wan 图像模型 (使用DashScope API Key)
  { provider: 'wan', modelName: 'wan2.7-image-pro', apiKey: apiKeys.dashscope, isActive: 1 },
  
  // HappyHorse 视频模型 (使用DashScope API Key)
  { provider: 'happyhorse', modelName: 'happyhorse-1.1-i2v', apiKey: apiKeys.dashscope, isActive: 1 },
];

console.log('=== 配置模型API Key ===\n');

let updatedCount = 0;
let insertedCount = 0;

for (const model of modelsToConfigure) {
  // 检查模型是否已存在
  const existing = db.prepare(
    'SELECT id FROM model_registry WHERE provider = ? AND model_name = ?'
  ).get(model.provider, model.modelName);

  if (existing) {
    // 更新现有模型
    db.prepare(`
      UPDATE model_registry 
      SET api_key = ?, is_active = ?
      WHERE provider = ? AND model_name = ?
    `).run(model.apiKey, model.isActive, model.provider, model.modelName);
    
    console.log(`✅ 更新: ${model.provider}/${model.modelName}`);
    updatedCount++;
  } else {
    // 插入新模型
    db.prepare(`
      INSERT INTO model_registry (provider, model_name, api_key, is_active, config)
      VALUES (?, ?, ?, ?, '{}')
    `).run(model.provider, model.modelName, model.apiKey, model.isActive);
    
    console.log(`➕ 新增: ${model.provider}/${model.modelName}`);
    insertedCount++;
  }
}

console.log(`\n=== 配置完成 ===`);
console.log(`更新: ${updatedCount} 个模型`);
console.log(`新增: ${insertedCount} 个模型`);

// 验证配置
console.log('\n=== 验证配置 ===');
const configured = db.prepare(`
  SELECT provider, model_name, is_active, 
         CASE WHEN api_key IS NOT NULL AND api_key != '' THEN '✅ 已配置' ELSE '❌ 未配置' END as key_status
  FROM model_registry 
  WHERE provider IN ('minimax', 'wan', 'happyhorse')
  ORDER BY provider, model_name
`).all();

console.table(configured);

db.close();
