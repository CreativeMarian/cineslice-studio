# CineSlice Studio 介绍视频合成脚本
# 混合AI宣传图和真实截图，带Ken Burns效果和淡入淡出转场

$ffmpeg = "E:\Demo\MOO\node_modules\ffmpeg-static\ffmpeg.exe"
$workDir = "E:\Demo\MOO\outputs"
$clipDir = "$workDir\clips"
$finalVideo = "$workDir\CineSlice_Studio_介绍_v2.mp4"

# 确保片段目录存在
if (!(Test-Path $clipDir)) { New-Item -ItemType Directory -Path $clipDir | Out-Null }

# 视频顺序：混合宣传图和真实截图
# 格式: @{file=图片路径; title=文字标题}
$slides = @(
    @{file="$workDir\promotional\01_hero.jpg"; title="CineSlice Studio"},
    @{file="$workDir\screenshots\02_landing.png"; title="项目首页"},
    @{file="$workDir\promotional\09_advantages.jpg"; title="核心优势"},
    @{file="$workDir\promotional\02_pipeline9.jpg"; title="9步全自动流水线"},
    @{file="$workDir\screenshots\08_pipeline_9steps.png"; title="全流程自动化"},
    @{file="$workDir\promotional\06_mindmap.jpg"; title="全流程架构"},
    @{file="$workDir\screenshots\04_mindmap.png"; title="思维导图"},
    @{file="$workDir\promotional\03_models.jpg"; title="20+ AI模型"},
    @{file="$workDir\screenshots\03_models.png"; title="模型配置"},
    @{file="$workDir\promotional\04_styles.jpg"; title="5种风格预设"},
    @{file="$workDir\screenshots\10_styles.png"; title="风格选择"},
    @{file="$workDir\promotional\05_novel_upload.jpg"; title="小说上传"},
    @{file="$workDir\screenshots\06_novel_upload.png"; title="上传解析"},
    @{file="$workDir\promotional\07_director.jpg"; title="导演工作台"},
    @{file="$workDir\screenshots\05_script_pipeline.png"; title="剧本流水线"},
    @{file="$workDir\promotional\08_export.jpg"; title="多格式导出"},
    @{file="$workDir\screenshots\07_export.png"; title="成片导出"},
    @{file="$workDir\promotional\10_cta.jpg"; title="开始创作之旅"}
)

Write-Output "=== 开始生成视频片段 ==="
Write-Output "共 $($slides.Count) 张图片"

# 生成每个片段
$clipFiles = @()
for ($i = 0; $i -lt $slides.Count; $i++) {
    $slide = $slides[$i]
    $inputFile = $slide.file
    $clipFile = "$clipDir\clip_$($i.ToString('00')).mp4"
    $clipFiles += $clipFile
    
    if (!(Test-Path $inputFile)) {
        Write-Output "WARNING: 文件不存在 $inputFile"
        continue
    }
    
    Write-Output "[$($i+1)/$($slides.Count)] 处理: $(Split-Path $inputFile -Leaf)"
    
    # FFmpeg命令：scale到1920x1080，zoompan Ken Burns效果，淡入淡出
    # 交替使用推进和拉远效果
    if ($i % 2 -eq 0) {
        $zoomExpr = "min(zoom+0.0012,1.12)"
    } else {
        $zoomExpr = "if(eq(on,1),1.12,max(zoom-0.0012,1.0))"
    }
    
    $filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,"
    $filter += "zoompan=z='$zoomExpr':d=120:s=1920x1080:fps=30,"
    $filter += "fade=t=in:st=0:d=0.6,fade=t=out:st=3.4:d=0.6,"
    $filter += "format=yuv420p"
    
    & $ffmpeg -y -loop 1 -i $inputFile -vf $filter -t 4 -r 30 -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p $clipFile 2>&1 | Select-Object -Last 1
}

Write-Output ""
Write-Output "=== 拼接所有片段 ==="

# 创建concat列表文件
$listFile = "$clipDir\concat_list.txt"
$content = ""
foreach ($clip in $clipFiles) {
    if (Test-Path $clip) {
        $content += "file '$clip'`n"
    }
}
$content | Out-File -FilePath $listFile -Encoding ASCII

# 拼接
& $ffmpeg -y -f concat -safe 0 -i $listFile -c copy $finalVideo 2>&1 | Select-Object -Last 3

Write-Output ""
Write-Output "=== 完成 ==="
if (Test-Path $finalVideo) {
    $file = Get-Item $finalVideo
    Write-Output "视频路径: $finalVideo"
    Write-Output "文件大小: $([math]::Round($file.Length / 1MB, 2)) MB"
} else {
    Write-Output "ERROR: 视频生成失败"
}
