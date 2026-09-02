#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""设置默认模型（不用豆包）"""

import sqlite3
import os
import uuid
from datetime import datetime

db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'cineslice-studio.db')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 获取用户ID
cursor.execute('SELECT id FROM users LIMIT 1')
user_row = cursor.fetchone()
user_id = user_row[0] if user_row else 'local_user'

now = datetime.now().isoformat()

print("=== 设置默认模型（不用豆包）===\n")

# 1. 设置 Wan 2.7 Image Pro 为默认图像模型
cursor.execute("SELECT id, provider, model_name, model_type FROM model_registry WHERE provider='wan' AND model_name='wan2.7-image-pro'")
wan_model = cursor.fetchone()
if wan_model:
    wan_id = wan_model[0]
    # 先取消所有图像模型的默认状态
    cursor.execute("UPDATE model_registry SET is_default=0 WHERE user_id=? AND model_type='image'", (user_id,))
    # 设置Wan为默认
    cursor.execute("UPDATE model_registry SET is_default=1, updated_at=? WHERE id=?", (now, wan_id))
    print(f"✅ 图像默认模型: Wan 2.7 Image Pro (ID: {wan_id})")
else:
    print("❌ 未找到 Wan 2.7 Image Pro 模型")

# 2. 设置 MiniMax-H3 为默认视频模型
cursor.execute("SELECT id, provider, model_name, model_type FROM model_registry WHERE provider='minimax' AND model_name='MiniMax-H3'")
minimax_model = cursor.fetchone()
if minimax_model:
    minimax_id = minimax_model[0]
    # 先取消所有视频模型的默认状态
    cursor.execute("UPDATE model_registry SET is_default=0 WHERE user_id=? AND model_type='video'", (user_id,))
    # 设置MiniMax为默认
    cursor.execute("UPDATE model_registry SET is_default=1, updated_at=? WHERE id=?", (now, minimax_id))
    print(f"✅ 视频默认模型: MiniMax-H3 (ID: {minimax_id})")
else:
    print("❌ 未找到 MiniMax-H3 模型")

# 3. 检查是否有 Edge TTS 音频模型
cursor.execute("SELECT id, provider, model_name, model_type FROM model_registry WHERE provider LIKE '%edge%' OR model_name LIKE '%edge%'")
edge_models = cursor.fetchall()
print(f"\n找到 Edge TTS 模型: {len(edge_models)} 个")
for m in edge_models:
    print(f"  {m[1]}/{m[2]} (ID: {m[0]})")

# 如果没有Edge TTS，添加一个
if not edge_models:
    print("\n➕ 添加 Edge TTS 音频模型...")
    edge_id = str(uuid.uuid4())
    cursor.execute('''
        INSERT INTO model_registry (id, user_id, provider, model_name, model_type, api_key, is_active, is_default, config, created_at, updated_at, supports_audio)
        VALUES (?, ?, 'edge-tts', 'edge-tts', 'audio', '', 1, 0, '{}', ?, ?, 1)
    ''', (edge_id, user_id, now, now))
    print(f"✅ 已添加 Edge TTS 模型 (ID: {edge_id})")
else:
    edge_id = edge_models[0][0]

# 设置 Edge TTS 为默认音频模型
cursor.execute("UPDATE model_registry SET is_default=0 WHERE user_id=? AND model_type='audio'", (user_id,))
cursor.execute("UPDATE model_registry SET is_default=1, is_active=1, updated_at=? WHERE id=?", (now, edge_id))
print(f"✅ 音频默认模型: Edge TTS (ID: {edge_id})")

conn.commit()

# 验证设置结果
print("\n=== 验证默认模型设置 ===")
cursor.execute('''
    SELECT model_type, provider, model_name, is_default, is_active
    FROM model_registry
    WHERE user_id=? AND is_default=1
    ORDER BY model_type
''', (user_id,))
defaults = cursor.fetchall()
for d in defaults:
    print(f"  {d[0]:<8} {d[1]}/{d[2]} - default:{d[3]} active:{d[4]}")

conn.close()
print("\n✅ 完成！所有默认模型已设置为非豆包模型")
