#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""测试HappyHorse和其他模型API"""

import urllib.request
import json

DASHSCOPE_API_KEY = 'sk-ws-H.EYIMRLL.DpWu.MEQCIEZzAx-33nmoICf8wO49IaAmbuwaQ-IafcZ2vPnMfr0FAiAv3J3NgK1M8QV1NvqszXl9D_poeSe2uQ61K-jpGCZjmQ'

print('测试: HappyHorse视频API')
url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
headers = {
    'X-DashScope-Async': 'enable',
    'Authorization': 'Bearer ' + DASHSCOPE_API_KEY,
    'Content-Type': 'application/json'
}
body = {
    'model': 'happyhorse-1.1-i2v',
    'input': {
        'prompt': 'A cinematic shot of a futuristic movie studio, dark blue tone'
    },
    'parameters': {
        'resolution': '720P',
        'duration': 5
    }
}

data = json.dumps(body).encode('utf-8')
req = urllib.request.Request(url, data=data, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print('  状态码:', response.status)
        print('  响应:', json.dumps(result, indent=2, ensure_ascii=False)[:500])
        print('  ✅ HappyHorse API连通成功')
except urllib.error.HTTPError as e:
    print('  HTTP错误:', e.code)
    print('  响应:', e.read().decode('utf-8')[:500])
except Exception as e:
    print('  错误:', e)

print()
print('测试: 通义万相wanx-v1图像API')
url2 = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'
body2 = {
    'model': 'wanx-v1',
    'input': {'prompt': 'test image'},
    'parameters': {'size': '1024*1024', 'n': 1}
}
data2 = json.dumps(body2).encode('utf-8')
req2 = urllib.request.Request(url2, data=data2, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req2, timeout=30) as response:
        result = json.loads(response.read().decode('utf-8'))
        print('  状态码:', response.status)
        print('  任务ID:', result.get('output', {}).get('task_id', 'N/A'))
        print('  ✅ wanx-v1 API连通成功')
except urllib.error.HTTPError as e:
    print('  HTTP错误:', e.code)
    print('  响应:', e.read().decode('utf-8')[:300])
except Exception as e:
    print('  错误:', e)

print()
print('测试完成')
