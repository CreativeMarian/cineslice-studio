#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成CineSlice Studio介绍视频的旁白配音"""

import asyncio
import edge_tts
import os

OUTPUT_PATH = r"E:\Demo\MOO\outputs\narration.mp3"

# 科技纪录片风格旁白脚本
TEXT = """在这个内容爆炸的时代，每个人都有故事想讲。
但从文字到影像，隔着一道专业的鸿沟。
直到，CineSlice Studio 的出现。

想象一下。
你只需要上传一篇小说，剩下的，交给AI。
9大阶段，全自动流水线，从剧本到视频，一气呵成。

第一步，文字的魔法。
系统智能解析小说，自动拆分章节，
AI把故事改编成专业剧本，
每一个场景，每一句对话，都精雕细琢。
你可以随时编辑，让故事更贴合你的想象。

接下来，构建你的世界。
AI自动提取每一个角色，
姓名、性格、外貌，栩栩如生。
生成角色概念图，让人物在不同镜头中保持一致。
同时提取场景，生成参考图，
让每一个空间都有自己的氛围和灵魂。

然后，是导演的舞台。
AI生成专业分镜表，
景别、运动、时长、画面描述，
每一个镜头都经过精心设计。
批量生成关键帧，再用首帧驱动视频，
让静态的画面，流动起来。
配上AI语音，多角色音色，
让你的角色，真正开口说话。

50多款AI模型，任你选择。
文本、图像、视频、音频，
豆包、DeepSeek、MiniMax、可灵、即梦，
主流厂商，自由切换。
5种专业风格预设：
动漫、国风、现代、科幻、电影级写实，
一键切换，找到属于你的视觉语言。

全自动，让创作零门槛。
人物一致性，让角色不翻脸。
本地部署，让数据安全无忧。
这不是工具，这是你的私人影视工作室。

CineSlice Studio，
切片式影视锻造工厂。
让每个人，都能成为导演。
现在，就开始你的创作之旅。"""

async def main():
    print("正在生成旁白配音...")
    communicate = edge_tts.Communicate(
        TEXT,
        "zh-CN-YunxiNeural",  # 沉稳男声
        rate="-5%",  # 稍慢语速，纪录片风格
        pitch="-2Hz"
    )
    await communicate.save(OUTPUT_PATH)
    print(f"配音已保存到: {OUTPUT_PATH}")
    
    # 检查文件大小
    size = os.path.getsize(OUTPUT_PATH)
    print(f"文件大小: {size / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    asyncio.run(main())
