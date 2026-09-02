#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""测试豆包和DeepSeek API可用性"""

import urllib.request
import json

# API Keys
DOUBAO_API_KEY = 'ade9a937-b444-45a6-8725-adfc70694f09'
DEEPSEEK_API_KEY = ''  # 需要从数据库获取

# 先从数据库获取DeepSeek API Key
import sqlite3
conn = sqlite3.connect('./data/cineslice-studio.db')
cursor = conn.cursor()
cursor.execute("SELECT api_key FROM model_registry WHERE provider='deepseek' AND model_name='deepseek-chat'")
row = cursor.fetchone()
if row:
    DEEPSEEK_API_KEY = row[0]
    print(f'获取到DeepSeek API Key: {DEEPSEEK_API_KEY[:20]}...')
conn.close()

print()
print('测试1: DeepSeek文本API')
url1 = 'https://api.deepseek.com/chat/completions'
headers1 = {
    'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
    'Content-Type': 'application/json'
}
body1 = {
    'model': 'deepseek-chat',
    'messages': [{'role': 'user', 'content': 'Hello, say hi in one word'}],
    'max_tokens': 10
}
data1 = json.dumps(body1).encode('utf-8')
req1 = urllib.request.Request(url1, data=data1, headers=headers1, method='POST')
try:
    with urllib.request.urlopen(req1, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print('  状态码:', response.status)
        print('  响应:', result.get('choices', [{}])[0].get('message', {}).get('content', 'N/A')[:100])
        print('  ✅ DeepSeek API可用')
except urllib.error.HTTPError as e:
    print('  HTTP错误:', e.code)
    print('  响应:', e.read().decode('utf-8')[:300])
except Exception as e:
    print('  错误:', e)

print()
print('测试2: 豆包图像API (Seedream)')
url2 = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
headers2 = {
    'Authorization': 'Bearer ' + DOUBAO_API_KEY,
    'Content-Type': 'application/json'
}
body2 = {
    'model': 'doubao-seedream-5-0-pro-260628',
    'prompt': 'A simple test image, blue sky',
    'size': '1024x1024',
    'response_format': 'url'
}
data2 = json.dumps(body2).encode('utf-8')
req2 = urllib.request.Request(url2, data=data2, headers=headers2, method='POST')
try:
    with urllib.request.urlopen(req2, timeout=60) as response:
        result = json.loads(response.read().decode('utf-8'))
        print('  状态码:', response.status)
        image_url = result.get('data', [{}])[0].get('url', 'N/A')
        print('  图像URL:', image_url[:100] if image_url != 'N/A' else 'N/A')
        print('  ✅ 豆包图像API可用')
except urllib.error.HTTPError as e:
    print('  HTTP错误:', e.code)
    print('  响应:', e.read().decode('utf-8')[:300])
except Exception as e:
    print('  错误:', e)

print()
print('测试完成')
