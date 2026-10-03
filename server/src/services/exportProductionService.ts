// 分镜投产包导出服务
// v1.0
// 一键出 H3 / Seedance 投产包：每个段一个文件夹（prompt.md + f1.png + f2.png ...）
// 对应 shuohao-skills novel-storyboard 阶段的 export 功能。
//
// 产出 production-pack-{episodeNumber}.zip：
//   manifest.json      — 项目信息、剧集信息、所有分镜元数据
//   script.md          — 完整剧本（novel_episodes.script_content）
//   characters/        — 所有角色概念图和四视图
//   scenes/            — 所有场景概念图
//   segments/E01-S01/  — 按段分组：prompt.md + f{序号}.png（该段每镜一张首帧图）

import archiver from 'archiver';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Database, NovelEpisode, Project, ScriptCharacter, ScriptScene, Shot, ShotKeyframe } from '../types';
import {
  ProjectDAO,
  NovelEpisodeDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ShotDAO,
  ShotKeyframeDAO,
} from '../models';
import { projectStorage } from './projectStorage';
import { downloadToFile } from '../utils/download';
import { getConfig } from '../config/env';

const config = getConfig();

/** 导出结果：ZIP 文件路径 + 统计信息 */
export interface ProductionPackResult {
  zipPath: string;
  project: { id: string; title: string; description: string | null; style_description: string | null };
  episode: { id: string; episode_number: number; title: string; word_count: number };
  totalShots: number;
  totalSegments: number;
}

/** 一个段的投产包内容（分镜 + 每镜首帧图） */
interface SegmentGroup {
  segmentId: number;      // 段编号（1 起），文件夹名 E{ep}-S{seg}
  shots: Shot[];
}

type ResolvedImage =
  | { kind: 'local'; localPath: string }
  | { kind: 'remote'; url: string }
  | null;

/** ZIP entry 名用：剔除 Windows / ZIP 非法字符，保留中文 */
function sanitizeName(name: string): string {
  const cleaned = (name || 'unnamed')
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'unnamed';
}

/**
 * 解析图片 URL 为本地文件或远程 URL。
 * 支持三种形态：
 *  - /data/...        → 项目数据目录本地文件（projectStorage.toLocalPath）
 *  - /uploads/...     → 上传目录本地文件
 *  - http(s)://...    → 远程 URL（downloadToFile 下载）
 */
function resolveImageSource(url: string | null | undefined): ResolvedImage {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/data/')) {
    const localPath = projectStorage.toLocalPath(trimmed);
    return localPath ? { kind: 'local', localPath } : null;
  }
  if (trimmed.startsWith('/uploads/')) {
    const clean = trimmed.replace(/^\/uploads\//, '');
    if (!clean || clean.includes('..')) return null;
    const localPath = path.resolve(config.uploadDir, clean);
    return { kind: 'local', localPath };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: 'remote', url: trimmed };
  }
  return null;
}

/** 从 ConceptImage 数组取选中的那张（selected_image_index 优先，回退第一张） */
function pickConceptImageUrl(images: Array<{ url?: string }> | null | undefined, selectedIndex: number): string | null {
  if (!images || images.length === 0) return null;
  const idx = selectedIndex >= 0 && selectedIndex < images.length ? selectedIndex : 0;
  return images[idx]?.url || images[0]?.url || null;
}

/**
 * 将一张图片加入 ZIP（本地直接归档；远程先下载到临时文件再归档）。
 * 下载失败/文件不存在时仅记录日志并跳过，不中断整个导出。
 */
async function archiveImage(
  archive: archiver.Archiver,
  url: string | null | undefined,
  zipEntryName: string,
  tempDir: string,
  tempFiles: string[],
): Promise<boolean> {
  const source = resolveImageSource(url);
  if (!source) return false;
  try {
    if (source.kind === 'local') {
      if (!fs.existsSync(source.localPath)) {
        console.warn(`[ExportProduction] 本地图片不存在，跳过: ${source.localPath}`);
        return false;
      }
      archive.file(source.localPath, { name: zipEntryName });
      return true;
    }
    // 远程 URL：先下载到临时目录
    const ext = path.extname(new URL(source.url).pathname) || '.png';
    const tempFile = path.join(tempDir, `${sanitizeName(path.basename(zipEntryName, path.extname(zipEntryName)))}${ext}`);
    await downloadToFile(source.url, tempFile, { timeoutMs: 60_000, maxBytes: 64 * 1024 * 1024 });
    tempFiles.push(tempFile);
    archive.file(tempFile, { name: zipEntryName });
    return true;
  } catch (err: any) {
    console.warn(`[ExportProduction] 图片处理失败，跳过 ${zipEntryName}: ${err?.message || err}`);
    return false;
  }
}

/** 取某镜头用于投产的帧图 URL：优先 first 帧，其次 end / last 帧 */
function pickShotFrameUrl(keyframes: ShotKeyframe[]): string | null {
  const first = keyframes.find(k => k.frame_type === 'first' && k.image_url);
  if (first?.image_url) return first.image_url;
  const end = keyframes.find(k => (k.frame_type === 'end' || k.frame_type === 'last') && k.image_url);
  if (end?.image_url) return end.image_url;
  return null;
}

/** 按 segment_id 分组；缺失时按累计 15 秒一组（AI 视频单段生成上限） */
function groupShotsIntoSegments(shots: Shot[]): SegmentGroup[] {
  const segments: SegmentGroup[] = [];

  const hasSegmentIds = shots.some(s => s.segment_id != null && s.segment_id > 0);
  if (hasSegmentIds) {
    const map = new Map<number, Shot[]>();
    for (const shot of shots) {
      const segId = shot.segment_id ?? 1;
      if (!map.has(segId)) map.set(segId, []);
      map.get(segId)!.push(shot);
    }
    const sortedIds = [...map.keys()].sort((a, b) => a - b);
    for (const segId of sortedIds) {
      segments.push({ segmentId: segId, shots: map.get(segId)! });
    }
    return segments;
  }

  // fallback：每 15 秒累计一组，段编号 1 起
  let current: Shot[] = [];
  let accSeconds = 0;
  let segNo = 1;
  for (const shot of shots) {
    if (current.length > 0 && accSeconds + (shot.duration_seconds || 0) > 15) {
      segments.push({ segmentId: segNo++, shots: current });
      current = [];
      accSeconds = 0;
    }
    current.push(shot);
    accSeconds += shot.duration_seconds || 0;
  }
  if (current.length > 0) {
    segments.push({ segmentId: segNo, shots: current });
  }
  return segments;
}

/** 生成单段 prompt.md（视频生成提示词：该段所有镜头的动作/台词/景别/时长） */
function buildSegmentPromptMd(
  segment: SegmentGroup,
  episode: NovelEpisode,
  project: Project,
  sceneNameById: Map<string, string>,
): string {
  const lines: string[] = [];
  const totalDuration = segment.shots.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

  lines.push(`# Segment S${String(segment.segmentId).padStart(2, '0')} — Episode ${episode.episode_number}`);
  lines.push('');
  lines.push(`**风格**: ${project.style_description || '（未设置）'}`);
  lines.push(`**镜头数**: ${segment.shots.length}`);
  lines.push(`**总时长**: ${Math.round(totalDuration * 10) / 10}秒`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const shot of segment.shots) {
    const sceneName = shot.scene_id ? (sceneNameById.get(shot.scene_id) || '') : '';
    const characters = Array.isArray(shot.characters_in_shot)
      ? shot.characters_in_shot.join('、')
      : (shot.characters_in_shot || '');

    lines.push(`## Shot ${shot.shot_number}（${shot.duration_seconds || 0}秒）`);
    lines.push(`- 景别: ${shot.shot_size || ''}`);
    lines.push(`- 镜头运动: ${shot.camera_movement || ''}`);
    lines.push(`- 画面: ${shot.action_description || ''}`);
    lines.push(`- 台词: ${shot.dialogue || ''}`);
    lines.push(`- 角色: ${characters || ''}`);
    lines.push(`- 场景: ${sceneName}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 导出指定剧集的分镜投产包 ZIP。
 * @param db         数据库实例
 * @param projectId  项目 ID
 * @param episodeId  剧集 ID
 * @param outputPath ZIP 文件完整目标路径（含文件名）
 * @returns ZIP 路径与统计信息
 */
export async function exportEpisodeProductionPack(
  db: Database,
  projectId: string,
  episodeId: string,
  outputPath: string,
): Promise<ProductionPackResult> {
  const project = ProjectDAO.getById(db, projectId);
  if (!project) {
    throw new Error(`项目不存在: ${projectId}`);
  }
  const episode = NovelEpisodeDAO.getById(db, episodeId);
  if (!episode || episode.project_id !== projectId) {
    throw new Error(`剧集不存在或不属于该项目: ${episodeId}`);
  }

  console.log(`[ExportProduction] 开始导出剧集 ${episode.episode_number}（${episode.title}）-> ${outputPath}`);

  // 0. 准备输出目录与临时目录（远程图片先落盘再归档）
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-production-'));
  const tempFiles: string[] = [];

  // 1. 收集数据
  const characters = ScriptCharacterDAO.listByEpisode(db, episodeId);
  const scenes = ScriptSceneDAO.listByEpisode(db, episodeId);
  const shots = ShotDAO.listByEpisode(db, episodeId);
  const sceneNameById = new Map<string, string>();
  for (const scene of scenes) {
    sceneNameById.set(scene.id, scene.name);
  }
  // 每镜关键帧（首帧/尾帧）
  const shotKeyframes = new Map<string, ShotKeyframe[]>();
  for (const shot of shots) {
    shotKeyframes.set(shot.id, ShotKeyframeDAO.listByShot(db, shot.id));
  }

  // 2. 分段
  const segments = groupShotsIntoSegments(shots);
  const epNum = String(episode.episode_number).padStart(2, '0');
  const epLabel = `E${epNum}`;

  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = fs.createWriteStream(outputPath);
  archive.pipe(output);

  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  try {
    // 3. script.md
    archive.append(episode.script_content || '', { name: 'script.md' });

    // 4. characters/ — 概念图 + 四视图
    for (const character of characters) {
      const base = `characters/${sanitizeName(character.name)}`;
      const conceptUrl = pickConceptImageUrl(character.concept_images as Array<{ url?: string }> | null, character.selected_image_index)
        || character.reference_image_url;
      await archiveImage(archive, conceptUrl, `${base}_concept.png`, tempDir, tempFiles);
      await archiveImage(archive, pickConceptImageUrl(character.four_view_images as Array<{ url?: string }> | null, 0), `${base}_fourview.png`, tempDir, tempFiles);
    }

    // 5. scenes/ — 场景概念图
    for (const scene of scenes) {
      const conceptUrl = pickConceptImageUrl(scene.concept_images as Array<{ url?: string }> | null, scene.selected_image_index);
      await archiveImage(archive, conceptUrl, `scenes/${sanitizeName(scene.name)}.png`, tempDir, tempFiles);
    }

    // 6. segments/ — 每段一个文件夹：prompt.md + f1.png + f2.png ...
    for (const segment of segments) {
      const segLabel = `${epLabel}-S${String(segment.segmentId).padStart(2, '0')}`;
      const dirName = `segments/${segLabel}`;
      const promptMd = buildSegmentPromptMd(segment, episode, project, sceneNameById);
      archive.append(promptMd, { name: `${dirName}/prompt.md` });
      let frameIndex = 1;
      for (const shot of segment.shots) {
        const frameUrl = pickShotFrameUrl(shotKeyframes.get(shot.id) || []);
        if (!frameUrl) {
          console.warn(`[ExportProduction] 镜头 ${shot.shot_number} 无可用帧图，跳过 f${frameIndex}.png`);
          frameIndex += 1;
          continue;
        }
        const ok = await archiveImage(archive, frameUrl, `${dirName}/f${frameIndex}.png`, tempDir, tempFiles);
        if (ok) {
          console.log(`[ExportProduction] ${segLabel} f${frameIndex}.png <- ${frameUrl}`);
        }
        frameIndex += 1;
      }
    }

    // 7. manifest.json
    const manifest = {
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        style_description: project.style_description,
      },
      episode: {
        id: episode.id,
        episode_number: episode.episode_number,
        title: episode.title,
        word_count: episode.word_count,
      },
      generated_at: new Date().toISOString(),
      total_shots: shots.length,
      total_segments: segments.length,
      characters: characters.map((c: ScriptCharacter) => ({
        name: c.name,
        gender: c.gender,
        role_type: c.role_type,
        visual_prompt: c.visual_prompt || null,
        has_concept_image: !!(pickConceptImageUrl(c.concept_images as Array<{ url?: string }> | null, c.selected_image_index) || c.reference_image_url),
        has_four_view: !!pickConceptImageUrl(c.four_view_images as Array<{ url?: string }> | null, 0),
      })),
      scenes: scenes.map((s: ScriptScene) => ({
        name: s.name,
        location: s.location,
        time_of_day: s.time_of_day,
        visual_prompt: s.visual_prompt || null,
        has_concept_image: !!pickConceptImageUrl(s.concept_images as Array<{ url?: string }> | null, s.selected_image_index),
      })),
      segments: segments.map(seg => ({
        segment_id: seg.segmentId,
        shot_count: seg.shots.length,
        total_duration: Math.round(seg.shots.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) * 10) / 10,
        shots: seg.shots.map(shot => ({
          shot_number: shot.shot_number,
          shot_size: shot.shot_size,
          camera_movement: shot.camera_movement,
          action_description: shot.action_description,
          dialogue: shot.dialogue,
          duration_seconds: shot.duration_seconds,
          characters_in_shot: shot.characters_in_shot,
          scene_name: shot.scene_id ? (sceneNameById.get(shot.scene_id) || null) : null,
        })),
      })),
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    archive.finalize();
    await finished;
  } finally {
    // 清理临时下载文件
    for (const f of tempFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    try { fs.rmdirSync(tempDir); } catch { /* ignore */ }
  }

  console.log(`[ExportProduction] 导出完成: ${outputPath}（${shots.length} 镜 / ${segments.length} 段）`);

  return {
    zipPath: outputPath,
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      style_description: project.style_description,
    },
    episode: {
      id: episode.id,
      episode_number: episode.episode_number,
      title: episode.title,
      word_count: episode.word_count,
    },
    totalShots: shots.length,
    totalSegments: segments.length,
  };
}
