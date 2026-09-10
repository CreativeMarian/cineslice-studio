const db = require('better-sqlite3')('data/cineslice-studio.db');
const rows = db.prepare("SELECT id, provider, model_name, model_type, endpoint_url, is_default, recommended_for FROM model_registry WHERE supports_audio=1 OR model_type='audio' OR provider LIKE '%tts%' OR provider LIKE '%edge%' OR model_name LIKE '%tts%' OR model_name LIKE '%audio%'").all();
for (const r of rows) console.log(r.id, '|', r.provider, '|', r.model_name, '|', r.model_type, '|', (r.endpoint_url||'').slice(0,35), '| def:', r.is_default, '|', (r.recommended_for||'').slice(0,15));
