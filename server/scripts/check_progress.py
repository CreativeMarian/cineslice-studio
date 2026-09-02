#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查项目进度"""

import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'cineslice-studio.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()

# 列出所有表
c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = c.fetchall()
print("数据库表:")
for t in tables:
    print(f"  {t[0]}")

# 最近的项目
print("\n最近3个项目:")
c.execute("SELECT id, title, created_at, status FROM projects ORDER BY created_at DESC LIMIT 3")
projects = c.fetchall()
for p in projects:
    print(f"  {p[0]} | {p[1]} | {p[2]} | {p[3]}")

# 检查最新项目的各阶段
if projects:
    proj_id = projects[0][0]
    print(f"\n项目 {proj_id} 进度:")
    
    # 检查可能的表名
    stage_tables = [
        ('episodes', '剧集'),
        ('episode', '剧集'),
        ('scripts', '剧本'),
        ('script', '剧本'),
        ('characters', '角色'),
        ('character', '角色'),
        ('scenes', '场景'),
        ('scene', '场景'),
        ('shots', '分镜'),
        ('shot', '分镜'),
        ('shot_keyframes', '关键帧'),
        ('keyframes', '关键帧'),
        ('shot_videos', '视频'),
        ('videos', '视频'),
        ('voiceovers', '配音'),
        ('audio', '配音'),
    ]
    
    for table, name in stage_tables:
        try:
            # 检查是否有project_id列
            c.execute(f"PRAGMA table_info({table})")
            columns = [col[1] for col in c.fetchall()]
            if 'project_id' in columns:
                c.execute(f"SELECT COUNT(*) FROM {table} WHERE project_id=?", (proj_id,))
                count = c.fetchone()[0]
                if count > 0:
                    print(f"  ✅ {name}: {count} 条")
                else:
                    print(f"  ⬜ {name}: 0 条")
            elif 'episode_id' in columns:
                # 通过episode关联
                c.execute(f"SELECT COUNT(*) FROM {table} e JOIN episodes ep ON e.episode_id=ep.id WHERE ep.project_id=?", (proj_id,))
                count = c.fetchone()[0]
                if count > 0:
                    print(f"  ✅ {name}: {count} 条")
        except Exception as e:
            pass

conn.close()
