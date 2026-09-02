#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Edge TTS 本地服务
为 CineSlice Studio 提供免费的微软Edge TTS语音合成服务

安装依赖:
    pip install edge-tts flask flask-cors

启动服务:
    python edge_tts_server.py

默认服务地址: http://127.0.0.1:5000
API接口: POST /tts
请求体: {"text": "你好", "voice": "zh-CN-XiaoxiaoNeural", "rate": "+0%", "pitch": "+0Hz"}
响应: audio/mpeg 二进制音频数据
"""

import io
import sys
import argparse
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

try:
    import edge_tts
except ImportError:
    print("错误: 未安装 edge-tts 库")
    print("请运行: pip install edge-tts")
    sys.exit(1)

app = Flask(__name__)
CORS(app)  # 允许跨域请求


@app.route('/tts', methods=['POST'])
async def text_to_speech():
    """文本转语音接口"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "请求体不能为空"}), 400
        
        text = data.get('text', '').strip()
        voice = data.get('voice', 'zh-CN-XiaoxiaoNeural')
        rate = data.get('rate', '+0%')
        pitch = data.get('pitch', '+0Hz')
        
        if not text:
            return jsonify({"error": "文本内容不能为空"}), 400
        
        # 限制文本长度
        if len(text) > 5000:
            return jsonify({"error": "文本长度不能超过5000字符"}), 400
        
        # 使用 edge-tts 生成音频
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        
        # 收集音频数据
        audio_data = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.write(chunk["data"])
        
        audio_data.seek(0)
        
        # 返回音频文件
        return send_file(
            audio_data,
            mimetype='audio/mpeg',
            as_attachment=False,
            download_name='tts_output.mp3'
        )
        
    except Exception as e:
        return jsonify({"error": f"TTS生成失败: {str(e)}"}), 500


@app.route('/voices', methods=['GET'])
def list_voices():
    """获取支持的音色列表"""
    try:
        # 获取所有可用音色
        voices = []
        # 注意: edge-tts 的 list_voices 是异步的
        # 这里返回常用的中文音色
        common_voices = [
            {"voice": "zh-CN-XiaoxiaoNeural", "name": "晓晓", "gender": "Female", "locale": "zh-CN"},
            {"voice": "zh-CN-YunxiNeural", "name": "云希", "gender": "Male", "locale": "zh-CN"},
            {"voice": "zh-CN-YunyangNeural", "name": "云扬", "gender": "Male", "locale": "zh-CN"},
            {"voice": "zh-CN-XiaoyiNeural", "name": "晓伊", "gender": "Female", "locale": "zh-CN"},
            {"voice": "zh-CN-XiaohanNeural", "name": "晓涵", "gender": "Female", "locale": "zh-CN"},
            {"voice": "zh-CN-XiaomengNeural", "name": "晓梦", "gender": "Female", "locale": "zh-CN"},
            {"voice": "zh-CN-XiaomoNeural", "name": "晓墨", "gender": "Female", "locale": "zh-CN"},
            {"voice": "zh-CN-XiaoqiuNeural", "name": "晓秋", "gender": "Female", "locale": "zh-CN"},
            {"voice": "zh-CN-XiaoruiNeural", "name": "晓睿", "gender": "Female", "locale": "zh-CN"},
            {"voice": "zh-CN-YunfengNeural", "name": "云锋", "gender": "Male", "locale": "zh-CN"},
            {"voice": "zh-CN-YunhaoNeural", "name": "云皓", "gender": "Male", "locale": "zh-CN"},
            {"voice": "zh-CN-YunjianNeural", "name": "云健", "gender": "Male", "locale": "zh-CN"},
            {"voice": "en-US-AriaNeural", "name": "Aria", "gender": "Female", "locale": "en-US"},
            {"voice": "en-US-GuyNeural", "name": "Guy", "gender": "Male", "locale": "en-US"},
            {"voice": "en-US-JennyNeural", "name": "Jenny", "gender": "Female", "locale": "en-US"},
        ]
        return jsonify({"voices": common_voices})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({"status": "ok", "service": "Edge TTS Server"})


def main():
    parser = argparse.ArgumentParser(description='Edge TTS 本地服务')
    parser.add_argument('--host', default='127.0.0.1', help='监听地址 (默认: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=5000, help='监听端口 (默认: 5000)')
    args = parser.parse_args()
    
    print("=" * 60)
    print("  Edge TTS 本地服务")
    print("  为 CineSlice Studio 提供免费语音合成")
    print("=" * 60)
    print(f"  服务地址: http://{args.host}:{args.port}")
    print(f"  API接口: POST http://{args.host}:{args.port}/tts")
    print(f"  音色列表: GET http://{args.host}:{args.port}/voices")
    print(f"  健康检查: GET http://{args.host}:{args.port}/health")
    print("=" * 60)
    print("  支持400+音色，完全免费，无需API Key")
    print("  按 Ctrl+C 停止服务")
    print("=" * 60)
    
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == '__main__':
    main()
