// 剧集生产服务统一出口（P3-9 拆分后保留本文件作为 index，重新导出全部函数）
// 拆分结构：
//   - 分镜生成（剧本重生成/润色/分镜）：shotGenerator.ts
//   - 关键帧生成（单镜/单帧/批量）：keyframeGenerator.ts
//   - 视频生成（单镜/状态/批量/字幕）：videoGenerator.ts
// 外部模块只需从本文件导入，无需感知内部文件拆分。

export * from './shotGenerator';
export * from './keyframeGenerator';
export * from './videoGenerator';
