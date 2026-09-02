#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""合成CineSlice Studio介绍视频：图片序列 + 旁白配音"""

import os
import subprocess
import tempfile

FFMPEG = r"E:\Demo\MOO\node_modules\ffmpeg-static\ffmpeg.exe"
OUTPUT_DIR = r"E:\Demo\MOO\outputs"
SCREENSHOTS_DIR = os.path.join(OUTPUT_DIR, "screenshots")
NARRATION = os.path.join(OUTPUT_DIR, "narration.mp3")
FINAL_OUTPUT = os.path.join(OUTPUT_DIR, "CineSlice_Studio_纪录片版.mp4")

# 10张截图，按旁白内容顺序排列
IMAGES = [
    "01_home.png",              # 开场：首页
    "08_pipeline_9steps.png",   # 愿景：9步流程
    "06_novel_upload.png",      # 剧本阶段：小说上传
    "05_script_pipeline.png",   # 剧本阶段：剧本编辑
    "02_landing.png",           # 资产阶段：角色/场景（用落地页代替）
    "07_export.png",            # 导演阶段：导出/视频
    "03_models.png",            # 模型与风格：模型配置
    "10_styles.png",            # 模型与风格：风格预设
    "09_models_landing.png",    # 核心优势
    "04_mindmap.png",           # 结尾：思维导图
]

def main():
    print("=== 合成CineSlice Studio介绍视频 ===")
    print(f"FFmpeg: {FFMPEG}")
    print(f"旁白: {NARRATION}")
    print(f"输出: {FINAL_OUTPUT}")
    
    # 检查文件
    if not os.path.exists(NARRATION):
        print(f"错误：旁白文件不存在 {NARRATION}")
        return
    
    missing = [img for img in IMAGES if not os.path.exists(os.path.join(SCREENSHOTS_DIR, img))]
    if missing:
        print(f"警告：以下截图不存在，将跳过: {missing}")
        IMAGES[:] = [img for img in IMAGES if img not in missing]
    
    print(f"使用 {len(IMAGES)} 张截图")
    
    # 音频时长约138秒，每张图片显示时长
    duration_per_image = 138.0 / len(IMAGES)
    print(f"每张图片显示: {duration_per_image:.1f} 秒")
    
    # 创建临时目录存放片段
    temp_dir = os.path.join(OUTPUT_DIR, "temp_clips")
    os.makedirs(temp_dir, exist_ok=True)
    
    # 为每张图片生成视频片段（带Ken Burns缩放效果）
    clip_files = []
    for i, img_name in enumerate(IMAGES):
        img_path = os.path.join(SCREENSHOTS_DIR, img_name)
        clip_path = os.path.join(temp_dir, f"clip_{i:02d}.mp4")
        clip_files.append(clip_path)
        
        if os.path.exists(clip_path):
            print(f"片段 {i+1}/{len(IMAGES)} 已存在，跳过")
            continue
        
        print(f"生成片段 {i+1}/{len(IMAGES)}: {img_name}")
        
        # Ken Burns效果：交替放大和缩小
        if i % 2 == 0:
            # 放大效果
            zoompan = f"zoompan=z='min(zoom+0.0015,1.5)':d={int(duration_per_image*25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30"
        else:
            # 缩小效果
            zoompan = f"zoompan=z='if(eq(on,1),1.3,max(zoom-0.0015,1))':d={int(duration_per_image*25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30"
        
        cmd = [
            FFMPEG, "-y",
            "-loop", "1",
            "-i", img_path,
            "-vf", f"{zoompan},format=yuv420p",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-t", str(duration_per_image),
            "-pix_fmt", "yuv420p",
            clip_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  警告：片段生成失败，尝试简单方式")
            # 简单方式：无缩放效果
            cmd_simple = [
                FFMPEG, "-y",
                "-loop", "1",
                "-i", img_path,
                "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-t", str(duration_per_image),
                "-r", "30",
                "-pix_fmt", "yuv420p",
                clip_path
            ]
            result = subprocess.run(cmd_simple, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"  错误：片段生成失败 {result.stderr[-200:]}")
                continue
    
    # 创建concat列表文件
    concat_file = os.path.join(temp_dir, "concat.txt")
    with open(concat_file, "w", encoding="utf-8") as f:
        for clip in clip_files:
            if os.path.exists(clip):
                f.write(f"file '{clip}'\n")
    
    # 拼接所有片段
    concat_video = os.path.join(temp_dir, "concat_video.mp4")
    print("\n拼接所有片段...")
    cmd_concat = [
        FFMPEG, "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_file,
        "-c", "copy",
        concat_video
    ]
    result = subprocess.run(cmd_concat, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"拼接失败，尝试重新编码: {result.stderr[-200:]}")
        # 重新编码拼接
        cmd_concat2 = [
            FFMPEG, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            concat_video
        ]
        result = subprocess.run(cmd_concat2, capture_output=True, text=True)
    
    # 合并视频和音频
    print("\n合并视频和音频...")
    cmd_final = [
        FFMPEG, "-y",
        "-i", concat_video,
        "-i", NARRATION,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-map", "0:v:0",
        "-map", "1:a:0",
        FINAL_OUTPUT
    ]
    result = subprocess.run(cmd_final, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"合并失败: {result.stderr[-300:]}")
        return
    
    # 验证结果
    if os.path.exists(FINAL_OUTPUT):
        size = os.path.getsize(FINAL_OUTPUT) / 1024 / 1024
        print(f"\n✅ 视频合成成功！")
        print(f"文件: {FINAL_OUTPUT}")
        print(f"大小: {size:.2f} MB")
    else:
        print("\n❌ 视频合成失败")

if __name__ == "__main__":
    main()
