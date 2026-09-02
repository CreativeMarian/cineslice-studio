#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""简单测试API连通性"""

import urllib.request
import json

# API Keys
DASHSCOPE_API_KEY = 'sk-ws-H.EYIMRLL.DpWu.MEQCIEZzAx-33nmoICf8wO49IaAmbuwaQ-IafcZ2vPnMfr0FAiAv3J3NgK1M8QV1NvqszXl9D_poeSe2uQ61K-jpGCZjmQ'
MINIMAX_API_KEY = 'sk-cp-OqGFJ2Itb9O96F5DAF6mymHUMISpyCKxHfSCM5TzlV49HK0hlYoLKJmEge2B5c61Vwnflq8B_ssus3QNd4hHGfos-RB44MvKOkWNWsUEi0c0YbGgdTWxpsE'

print('测试1: Wan图像API')
url1 = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'
headers1 = {
    'X-DashScope-Async': 'enable',
    'Authorization': 'Bearer ' + DASHSCOPE_API_KEY,
    'Content-Type': 'application/json'
}
body1 = {
    'model': 'wan2.7-image-pro',
    'input': {'prompt': 'test image'},
    'parameters': {'size': '1024*1024', 'n': 1}
}

data1 = json.dumps(body1).encode('utf-8')
req1 = urllib.request.Request(url1, data=data1, headers=headers1, method='POST')
try:
    with urllib.request.urlopen(req1, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print('  状态码:', response.status)
        print('  任务ID:', result.get('output', {}).get('task_id', 'N/A'))
        print('  ✅ Wan API连通成功')
except urllib.error.HTTPError as e:
    print('  HTTP错误:', e.code)
    print('  响应:', e.read().decode('utf-8')[:300])
except Exception as e:
    print('  错误:', e)

print()
print('测试2: MiniMax视频API')
url2 = 'https://api.minimaxi.com/v2/video_generation'
headers2 = {
    'Authorization': 'Bearer ' + MINIMAX_API_KEY,
    'Content-Type': 'application/json'
}
body2 = {
    'model': 'MiniMax-H3',
    'content': [{'type': 'text', 'text': 'test video'}],
    'resolution': '768P',
    'duration': 5,
    'ratio': '16:9'
}

data2 = json.dumps(body2).encode('utf-8')
req2 = urllib.request.Request(url2, data=data2, headers=headers2, method='POST')
try:
    with urllib.request.urlopen(req2, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print('  状态码:', response.status)
        print('  任务ID:', result.get('task_id', 'N/A'))
        print('  ✅ MiniMax API连通成功')
except urllib.error.HTTPError as e:
    print('  HTTP错误:', e.code)
    print('  响应:', e.read().decode('utf-8')[:300])
except Exception as e:
    print('  错误:', e)

print()
print('测试完成')
