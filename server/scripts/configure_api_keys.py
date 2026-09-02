#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""配置模型API Key到数据库"""

import sqlite3
import os
import uuid
from datetime import datetime

db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'cineslice-studio.db')

# API Key配置
api_keys = {
    # MiniMax API Key
    'minimax': 'sk-cp-OqGFJ2Itb9O96F5DAF6mymHUMISpyCKxHfSCM5TzlV49HK0hlYoLKJmEge2B5c61Vwnflq8B_ssus3QNd4hHGfos-RB44MvKOkWNWsUEi0c0YbGgdTWxpsE',
    
    # DashScope API Key (用于 Wan 图像模型 和 HappyHorse 视频模型)
    'dashscope': 'sk-ws-H.EYIMRLL.DpWu.MEQCIEZzAx-33nmoICf8wO49IaAmbuwaQ-IafcZ2vPnMfr0FAiAv3J3NgK1M8QV1NvqszXl9D_poeSe2uQ61K-jpGCZjmQ',
}

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 获取第一个用户ID
cursor.execute('SELECT id FROM users LIMIT 1')
user_row = cursor.fetchone()
user_id = user_row[0] if user_row else 'local_user'

now = datetime.now().isoformat()

print(f'使用用户ID: {user_id}\n')

# 需要配置的模型列表
models_to_configure = [
    # MiniMax 视频模型
    {'provider': 'minimax', 'model_name': 'MiniMax-H3', 'model_type': 'video', 'api_key': api_keys['minimax'], 'is_active': 1, 'supports_audio': 1},
    {'provider': 'minimax', 'model_name': 'minimax-h3', 'model_type': 'video', 'api_key': api_keys['minimax'], 'is_active': 1, 'supports_audio': 1},
    {'provider': 'minimax', 'model_name': 'minimax-video-01', 'model_type': 'video', 'api_key': api_keys['minimax'], 'is_active': 1, 'supports_audio': 0},
    
    # Wan 图像模型 (使用DashScope API Key)
    {'provider': 'wan', 'model_name': 'wan2.7-image-pro', 'model_type': 'image', 'api_key': api_keys['dashscope'], 'is_active': 1, 'supports_audio': 0},
    
    # HappyHorse 视频模型 (使用DashScope API Key)
    {'provider': 'happyhorse', 'model_name': 'happyhorse-1.1-i2v', 'model_type': 'video', 'api_key': api_keys['dashscope'], 'is_active': 1, 'supports_audio': 1},
]

print('=== 配置模型API Key ===\n')

updated_count = 0
inserted_count = 0

for model in models_to_configure:
    # 检查模型是否已存在
    cursor.execute(
        'SELECT id FROM model_registry WHERE provider = ? AND model_name = ?',
        (model['provider'], model['model_name'])
    )
    existing = cursor.fetchone()
    
    if existing:
        # 更新现有模型
        cursor.execute('''
            UPDATE model_registry 
            SET api_key = ?, is_active = ?, supports_audio = ?, updated_at = ?
            WHERE provider = ? AND model_name = ?
        ''', (model['api_key'], model['is_active'], model['supports_audio'], now, model['provider'], model['model_name']))
        
        print(f"✅ 更新: {model['provider']}/{model['model_name']}")
        updated_count += 1
    else:
        # 插入新模型
        model_id = str(uuid.uuid4())
        cursor.execute('''
            INSERT INTO model_registry (id, user_id, provider, model_name, model_type, api_key, is_active, is_default, config, created_at, updated_at, supports_audio)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, '{}', ?, ?, ?)
        ''', (model_id, user_id, model['provider'], model['model_name'], model['model_type'], model['api_key'], model['is_active'], now, now, model['supports_audio']))
        
        print(f"➕ 新增: {model['provider']}/{model['model_name']}")
        inserted_count += 1

conn.commit()

print(f'\n=== 配置完成 ===')
print(f'更新: {updated_count} 个模型')
print(f'新增: {inserted_count} 个模型')

# 验证配置
print('\n=== 验证配置 ===')
cursor.execute('''
    SELECT provider, model_name, model_type, is_active, supports_audio,
           CASE WHEN api_key IS NOT NULL AND api_key != '' THEN '✅ 已配置' ELSE '❌ 未配置' END as key_status
    FROM model_registry 
    WHERE provider IN ('minimax', 'wan', 'happyhorse')
    ORDER BY provider, model_name
''')

rows = cursor.fetchall()
print(f"{'Provider':<15} {'Model Name':<25} {'Type':<8} {'Active':<8} {'Audio':<8} {'Key':<10}")
print('-' * 80)
for row in rows:
    print(f"{row[0]:<15} {row[1]:<25} {row[2]:<8} {row[3]:<8} {row[4]:<8} {row[5]:<10}")

conn.close()
