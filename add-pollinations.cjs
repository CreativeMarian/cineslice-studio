const db = require('better-sqlite3')('E:/Demo/MOO/data/cineslice-studio.db');
const rows = db.prepare("SELECT user_id, COUNT(*) c FROM model_registry GROUP BY user_id").all();
console.log('user groups:', JSON.stringify(rows));
const one = db.prepare("SELECT user_id FROM model_registry WHERE provider='comfyui' LIMIT 1").get();
console.log('comfyui user_id:', one && one.user_id);

// 插入 pollinations 图像模型（幂等）
const userId = one ? one.user_id : 'local-user';
const exists = db.prepare("SELECT id FROM model_registry WHERE provider='pollinations' AND model_name='flux'").get();
if (!exists) {
  db.prepare(`INSERT INTO model_registry (user_id, provider, model_name, model_type, api_key, endpoint_url, is_active, is_default, recommended_for, created_at, updated_at)
              VALUES (?, 'pollinations', 'flux', 'image', 'free', 'https://image.pollinations.ai', 1, 0, 'keyframe', datetime('now'), datetime('now'))`).run(userId);
  console.log('pollinations inserted for user', userId);
} else {
  console.log('pollinations already exists:', exists.id);
}
console.log(db.prepare("SELECT id, provider, model_name, model_type, endpoint_url FROM model_registry WHERE provider='pollinations'").all());
