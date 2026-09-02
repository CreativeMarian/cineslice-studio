#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""测试Wan图像API和MiniMax视频API"""

import urllib.request
import json
import time
import os

# API Keys
DASHSCOPE_API_KEY = 'sk-ws-H.EYIMRLL.DpWu.MEQCIEZzAx-33nmoICf8wO49IaAmbuwaQ-IafcZ2vPnMfr0FAiAv3J3NgK1M8QV1NvqszXl9D_poeSe2uQ61K-jpGCZjmQ'
MINIMAX_API_KEY = 'sk-cp-OqGFJ2Itb9O96F5DAF6mymHUMISpyCKxHfSCM5TzlV49HK0hlYoLKJmEge2B5c61Vwnflq8B_ssus3QNd4hHGfos-RB44MvKOkWNWsUEi0c0YbGgdTWxpsE'

def call_api(url, headers, body, timeout=30):
    """调用API"""
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            result = json.loads(response.read().decode('utf-8'))
            return response.status, result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        return e.code, json.loads(error_body) if error_body else {}
    except Exception as e:
        return -1, {'error': str(e)}

def test_wan_image():
    """测试Wan图像API"""
    print('=' * 60)
    print('测试Wan图像API')
    print('=' * 60)
    
    url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'
    headers = {
        'X-DashScope-Async': 'enable',
        'Authorization': f'Bearer {DASHSCOPE_API_KEY}',
        'Content-Type': 'application/json'
    }
    body = {
        'model': 'wan2.7-image-pro',
        'input': {
            'prompt': 'CineSlice Studio AI movie creation tool, cinematic, futuristic, dark blue tone, movie poster style'
        },
        'parameters': {
            'size': '1280*720',
            'n': 1
        }
    }
    
    status, result = call_api(url, headers, body)
    print(f'状态码: {status}')
    print(f'响应: {json.dumps(result, indent=2, ensure_ascii=False)[:500]}')
    
    if status == 200 and 'output' in result and 'task_id' in result['output']:
        task_id = result['output']['task_id']
        print(f'\n任务ID: {task_id}')
        print('等待图像生成...')
        
        # 轮询任务状态
        for i in range(40):  # 最多等待2分钟
            time.sleep(3)
            query_url = f'{url}/{task_id}'
            query_headers = {
                'Authorization': f'Bearer {DASHSCOPE_API_KEY}',
                'Content-Type': 'application/json'
            }
            q_status, q_result = call_api(query_url, query_headers, {}, timeout=15)
            # GET请求不需要body，但call_api会发送POST，需要修改
            
            # 用GET请求
            req = urllib.request.Request(query_url, headers=query_headers, method='GET')
            try:
                with urllib.request.urlopen(req, timeout=15) as response:
                    q_result = json.loads(response.read().decode('utf-8'))
                    q_status = response.status
            except Exception as e:
                print(f'查询错误: {e}')
                continue
            
            task_status = q_result.get('output', {}).get('task_status', 'UNKNOWN')
            print(f'  第{i+1}次查询: {task_status}')
            
            if task_status == 'SUCCEEDED':
                results = q_result.get('output', {}).get('results', [])
                if results:
                    image_url = results[0].get('url', '')
                    print(f'\n✅ 图像生成成功!')
                    print(f'图像URL: {image_url}')
                    return image_url
                break
            elif task_status == 'FAILED':
                print(f'\n❌ 图像生成失败')
                print(f'错误: {json.dumps(q_result, indent=2, ensure_ascii=False)}')
                return None
    
    return None

def test_minimax_video():
    """测试MiniMax视频API"""
    print('\n' + '=' * 60)
    print('测试MiniMax视频API')
    print('=' * 60)
    
    url = 'https://api.minimaxi.com/v2/video_generation'
    headers = {
        'Authorization': f'Bearer {MINIMAX_API_KEY}',
        'Content-Type': 'application/json'
    }
    body = {
        'model': 'MiniMax-H3',
        'content': [
            {
                'type': 'text',
                'text': 'Cinematic shot of a futuristic AI movie studio, dark blue tone, particles floating, camera slowly pushing in, movie production environment'
            }
        ],
        'resolution': '768P',
        'duration': 5,
        'ratio': '16:9'
    }
    
    status, result = call_api(url, headers, body)
    print(f'状态码: {status}')
    print(f'响应: {json.dumps(result, indent=2, ensure_ascii=False)[:500]}')
    
    if status == 200 and 'task_id' in result:
        task_id = result['task_id']
        print(f'\n任务ID: {task_id}')
        print('等待视频生成...')
        
        # 轮询任务状态
        for i in range(60):  # 最多等待5分钟
            time.sleep(5)
            query_url = f'{url}/{task_id}'
            req = urllib.request.Request(query_url, headers=headers, method='GET')
            try:
                with urllib.request.urlopen(req, timeout=15) as response:
                    q_result = json.loads(response.read().decode('utf-8'))
            except Exception as e:
                print(f'查询错误: {e}')
                continue
            
            task = q_result.get('task', {})
            task_status = task.get('status', 'UNKNOWN')
            print(f'  第{i+1}次查询: {task_status}')
            
            if task_status == 'succeeded':
                video_url = task.get('content', {}).get('url', '')
                print(f'\n✅ 视频生成成功!')
                print(f'视频URL: {video_url}')
                return video_url
            elif task_status == 'failed':
                print(f'\n❌ 视频生成失败')
                print(f'错误: {json.dumps(q_result, indent=2, ensure_ascii=False)}')
                return None
    
    return None

if __name__ == '__main__':
    # 测试Wan图像API
    image_url = test_wan_image()
    
    # 测试MiniMax视频API
    video_url = test_minimax_video()
    
    print('\n' + '=' * 60)
    print('测试完成')
    print('=' * 60)
    if image_url:
        print(f'图像URL: {image_url}')
    if video_url:
        print(f'视频URL: {video_url}')
