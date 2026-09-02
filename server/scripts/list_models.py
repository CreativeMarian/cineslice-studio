#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""查询数据库中配置了API Key的模型"""

import sqlite3

conn = sqlite3.connect('./data/cineslice-studio.db')
cursor = conn.cursor()

cursor.execute('''
    SELECT provider, model_name, model_type, is_active,
           CASE WHEN api_key IS NOT NULL AND api_key != '' THEN 'YES' ELSE 'NO' END as has_key
    FROM model_registry 
    WHERE api_key IS NOT NULL AND api_key != ''
    ORDER BY provider, model_name
''')
rows = cursor.fetchall()

print('已配置API Key的模型:')
print('=' * 90)
print(f"{'Provider':<20} {'Model Name':<30} {'Type':<8} {'Active':<8} {'API Key':<8}")
print('-' * 90)
for row in rows:
    print(f"{row[0]:<20} {row[1]:<30} {row[2]:<8} {str(row[3]):<8} {row[4]:<8}")

print()
print('按类型统计:')
cursor.execute('''
    SELECT model_type, COUNT(*) as count 
    FROM model_registry 
    WHERE api_key IS NOT NULL AND api_key != ''
    GROUP BY model_type
''')
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]}个")

conn.close()
