// ZIP 导入服务
// v1.0

import path from 'path';
import fs from 'fs';
import type { Database, Project } from '../types';
import {
  ProjectDAO,
  NovelChapterDAO,
  NovelEpisodeDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ShotVideoIntervalDAO,
} from '../models';
import { projectStorage } from './projectStorage';

export interface ImportResult {
  project: Project;
  chaptersCount: number;
  episodesCount: number;
}

// 从 ZIP 中导入资产文件到新项目目录，返回新的 URL
function importAssetFile(
  fileMap: Map<string, Buffer>,
  oldUrl: string,
  newProjectId: string,
  subDir: 'keyframes' | 'characters' | 'scenes' | 'videos'
): string {
  if (!oldUrl || oldUrl.startsWith('http') || oldUrl.startsWith('data:')) {
    return oldUrl;
  }

  // 从旧 URL 中提取文件名
  const fileName = path.basename(oldUrl);
  // 在 ZIP 中查找对应的文件（可能在多个目录中）
  const possiblePaths = Array.from(fileMap.keys()).filter(p => p.endsWith(`/${fileName}`) || p.endsWith(`\\${fileName}`));
  
  if (possiblePaths.length === 0) {
    return oldUrl; // 找不到文件，保留原 URL
  }

  // 保存到新项目目录
  const saveDir = path.resolve(projectStorage.getDataDir(newProjectId), subDir);
  projectStorage.ensureDir(saveDir);
  const newPath = path.resolve(saveDir, fileName);
  
  try {
    fs.writeFileSync(newPath, fileMap.get(possiblePaths[0])!);
    return projectStorage.toUrlPath(newPath);
  } catch {
    return oldUrl;
  }
}

export async function importProject(
  db: Database,
  zipFilePath: string,
  userId: string
): Promise<ImportResult> {
  // 动态加载 unzipper
  const unzipper = await import('unzipper');
  const directory = await unzipper.default.Open.file(zipFilePath);

  // 读取 manifest
  let projectData: any = null;
  const fileMap = new Map<string, Buffer>();

  for (const file of directory.files) {
    const content = await file.buffer();
    fileMap.set(file.path, content);
    if (file.path === 'project.json') {
      projectData = JSON.parse(content.toString('utf-8'));
    }
  }

  if (!projectData) {
    throw new Error('无效的项目包：缺少 project.json');
  }

  // 创建新项目
  const project = ProjectDAO.create(db, {
    user_id: userId,
    title: `${projectData.title || '导入项目'} (导入)`,
    description: projectData.description || '',
  });

  let chaptersCount = 0;
  let episodesCount = 0;

  // 导入章节
  const chapterFiles = Array.from(fileMap.keys()).filter(p => p.startsWith('chapters/') && p.endsWith('.json'));
  for (const cf of chapterFiles) {
    try {
      const chapter = JSON.parse(fileMap.get(cf)!.toString('utf-8'));
      NovelChapterDAO.create(db, {
        user_id: userId,
        project_id: project.id,
        chapter_number: chapter.chapter_number,
        title: chapter.title,
        content: chapter.content,
        source_file: chapter.source_file,
      });
      chaptersCount++;
    } catch (err) {
      console.error(`[Import] 章节导入失败 ${cf}:`, err);
    }
  }

  // 导入剧集
  const episodeFiles = Array.from(fileMap.keys()).filter(p => /^episodes\/\d+\.json$/.test(p));
  for (const ef of episodeFiles) {
    try {
      const episode = JSON.parse(fileMap.get(ef)!.toString('utf-8'));
      const epNum = parseInt(path.basename(ef, '.json'), 10);
      const newEpisode = NovelEpisodeDAO.create(db, {
        user_id: userId,
        project_id: project.id,
        episode_number: epNum,
        title: episode.title,
        chapter_range: episode.chapter_range,
        script_content: episode.script_content,
        text_model_used: episode.text_model_used,
      });
      episodesCount++;

      const epPrefix = `episodes/${epNum}/`;

      // 导入角色
      const charFiles = Array.from(fileMap.keys()).filter(p => p.startsWith(`${epPrefix}characters/`) && p.endsWith('.json'));
      for (const cf of charFiles) {
        try {
          const char = JSON.parse(fileMap.get(cf)!.toString('utf-8'));
          // 导入角色概念图资产
          let conceptImages = char.concept_images;
          if (conceptImages) {
            try {
              const images = JSON.parse(conceptImages) as Array<{ url: string }>;
              const newImages = images.map(img => ({
                ...img,
                url: importAssetFile(fileMap, img.url, project.id, 'characters'),
              }));
              conceptImages = JSON.stringify(newImages);
            } catch { /* keep original */ }
          }
          const newChar = ScriptCharacterDAO.create(db, {
            user_id: userId,
            episode_id: newEpisode.id,
            name: char.name,
            gender: char.gender,
            role_type: char.role_type,
            description: char.description,
            visual_description: char.visual_description,
          });
          // 更新扩展字段
          ScriptCharacterDAO.update(db, newChar.id, {
            concept_images: conceptImages,
            reference_image_url: char.reference_image_url ? importAssetFile(fileMap, char.reference_image_url, project.id, 'characters') : undefined,
          });
        } catch (err) {
          console.error(`[Import] 角色导入失败 ${cf}:`, err);
        }
      }

      // 导入场景
      const sceneFiles = Array.from(fileMap.keys()).filter(p => p.startsWith(`${epPrefix}scenes/`) && p.endsWith('.json'));
      for (const sf of sceneFiles) {
        try {
          const scene = JSON.parse(fileMap.get(sf)!.toString('utf-8'));
          // 导入场景概念图资产
          let conceptImages = scene.concept_images;
          if (conceptImages) {
            try {
              const images = JSON.parse(conceptImages) as Array<{ url: string }>;
              const newImages = images.map(img => ({
                ...img,
                url: importAssetFile(fileMap, img.url, project.id, 'scenes'),
              }));
              conceptImages = JSON.stringify(newImages);
            } catch { /* keep original */ }
          }
          const newScene = ScriptSceneDAO.create(db, {
            user_id: userId,
            episode_id: newEpisode.id,
            name: scene.name,
            location: scene.location,
            time_of_day: scene.time_of_day,
            atmosphere: scene.atmosphere,
            description: scene.description,
          });
          // 更新扩展字段
          ScriptSceneDAO.update(db, newScene.id, {
            concept_images: conceptImages,
          });
        } catch (err) {
          console.error(`[Import] 场景导入失败 ${sf}:`, err);
        }
      }

      // 导入镜头
      const shotFiles = Array.from(fileMap.keys()).filter(p => new RegExp(`^${epPrefix}shots/[^/]+\\.json$`).test(p));
      // 旧关键帧ID -> 新关键帧ID 映射表（用于更新视频片段的 frame 引用）
      const keyframeIdMap = new Map<string, string>();

      for (const sf of shotFiles) {
        try {
          const shot = JSON.parse(fileMap.get(sf)!.toString('utf-8'));
          const newShot = ShotDAO.create(db, {
            user_id: userId,
            episode_id: newEpisode.id,
            shot_number: shot.shot_number,
            shot_size: shot.shot_size,
            action_description: shot.action_description,
            dialogue: shot.dialogue,
            camera_movement: shot.camera_movement,
            grid_position: shot.grid_position,
            duration_seconds: shot.duration_seconds,
            characters_in_shot: shot.characters_in_shot,
            props_in_shot: shot.props_in_shot,
            notes: shot.notes,
          });

          // 导入关键帧
          const shotId = path.basename(sf, '.json');
          const kfPrefix = `${epPrefix}shots/${shotId}/keyframes/`;
          const kfFiles = Array.from(fileMap.keys()).filter(p => p.startsWith(kfPrefix) && p.endsWith('.json'));
          for (const kf of kfFiles) {
            try {
              const keyframe = JSON.parse(fileMap.get(kf)!.toString('utf-8'));
              const newImageUrl = importAssetFile(fileMap, keyframe.image_url, project.id, 'keyframes');
              const newKeyframe = ShotKeyframeDAO.create(db, {
                user_id: userId,
                shot_id: newShot.id,
                frame_type: keyframe.frame_type,
                prompt: keyframe.prompt,
                negative_prompt: keyframe.negative_prompt,
                image_url: newImageUrl,
                image_model_used: keyframe.image_model_used,
              });
              // 记录旧ID -> 新ID映射
              if (keyframe.id && newKeyframe?.id) {
                keyframeIdMap.set(keyframe.id, newKeyframe.id);
              }
            } catch (err) {
              console.error(`[Import] 关键帧导入失败 ${kf}:`, err);
            }
          }

          // 导入视频片段
          const videoPrefix = `${epPrefix}shots/${shotId}/videos/`;
          const videoFiles = Array.from(fileMap.keys()).filter(p => p.startsWith(videoPrefix) && p.endsWith('.json'));
          for (const vf of videoFiles) {
            try {
              const video = JSON.parse(fileMap.get(vf)!.toString('utf-8'));
              const newVideoUrl = importAssetFile(fileMap, video.video_url, project.id, 'videos');
              // 更新关键帧引用ID为新ID
              const newStartFrameId = video.start_frame_id ? (keyframeIdMap.get(video.start_frame_id) ?? undefined) : undefined;
              const newEndFrameId = video.end_frame_id ? (keyframeIdMap.get(video.end_frame_id) ?? undefined) : undefined;
              const newVideo = ShotVideoIntervalDAO.create(db, {
                user_id: userId,
                shot_id: newShot.id,
                start_frame_id: newStartFrameId,
                end_frame_id: newEndFrameId,
                duration_seconds: video.duration_seconds,
                video_model_used: video.video_model_used,
                motion_prompt: video.motion_prompt,
              });
              // 更新扩展字段
              ShotVideoIntervalDAO.update(db, newVideo.id, {
                video_url: newVideoUrl,
                status: video.status || 'completed',
              });
            } catch (err) {
              console.error(`[Import] 视频导入失败 ${vf}:`, err);
            }
          }
        } catch (err) {
          console.error(`[Import] 镜头导入失败 ${sf}:`, err);
        }
      }
    } catch (err) {
      console.error(`[Import] 剧集导入失败 ${ef}:`, err);
    }
  }

  return { project, chaptersCount, episodesCount };
}
