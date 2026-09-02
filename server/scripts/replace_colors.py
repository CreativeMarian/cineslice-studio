#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量替换硬编码的琥珀金颜色为橙色（uupm.cc风格）"""

import os
import re

# 颜色映射：琥珀金 -> 橙色
color_map = {
    # rgba格式
    'rgba(224,168,62': 'rgba(249,115,22',
    'rgba(217,154,38': 'rgba(249,115,22',
    'rgba(255,138,76': 'rgba(251,146,60',
    # 十六进制格式
    '#D99A26': '#F97316',
    '#d99a26': '#f97316',
    '#E0A83E': '#FB923C',
    '#e0a83e': '#fb923c',
    '#FF8A4C': '#FDBA74',
    '#ff8a4c': '#fdba74',
    # 带空格的rgba
    'rgba(224, 168, 62': 'rgba(249, 115, 22',
    'rgba(217, 154, 38': 'rgba(249, 115, 22',
    'rgba(255, 138, 76': 'rgba(251, 146, 60',
}

src_dir = r"E:\Demo\MOO\src"
modified_files = []

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith(('.tsx', '.ts', '.css', '.jsx', '.js')):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original = content
                for old, new in color_map.items():
                    content = content.replace(old, new)
                
                if content != original:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(content)
                    rel_path = os.path.relpath(filepath, src_dir)
                    modified_files.append(rel_path)
                    print(f"✅ 修改: {rel_path}")
            except Exception as e:
                print(f"❌ 错误 {filepath}: {e}")

print(f"\n✅ 完成！共修改 {len(modified_files)} 个文件")
