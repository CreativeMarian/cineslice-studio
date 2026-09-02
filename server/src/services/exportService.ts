// ZIP 导出服务
// v1.0

import archiver from 'archiver';
import { PassThrough } from 'stream';
import type { Database } from '../types';
import {
  ProjectDAO,
  NovelChapterDAO,
  NovelEpisodeDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ScriptPropDAO,
  ShotDAO,
  ShotKeyframeDAO,
  ShotVideoIntervalDAO,
} from '../models';
import { projectStorage } from './projectStorage';
import fs from 'fs';
import path from 'path';

export async function exportProject(
  db: Database,
  projectId: string,
  userId: string
): Promise<PassThrough> {
  const project = ProjectDAO.getByIdAndUser(db, projectId, userId);
  if (!project) {
    throw new Error('项目不存在');
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  archive.pipe(stream);

  // 1. project.json
  archive.append(JSON.stringify(project, null, 2), { name: 'project.json' });

  // 2. chapters/
  const chapters = NovelChapterDAO.listByProject(db, projectId);
  for (const ch of chapters) {
    archive.append(JSON.stringify(ch, null, 2), { name: `chapters/${ch.chapter_number}.json` });
    archive.append(ch.content, { name: `chapters/${ch.chapter_number}.txt` });
  }

  // 3. episodes/
  const episodes = NovelEpisodeDAO.listByProject(db, projectId);
  for (const ep of episodes) {
    archive.append(JSON.stringify(ep, null, 2), { name: `episodes/${ep.episode_number}.json` });
    archive.append(ep.script_content, { name: `episodes/${ep.episode_number}.md` });

    // 3.1 characters/
    const characters = ScriptCharacterDAO.listByEpisode(db, ep.id);
    for (const char of characters) {
      archive.append(JSON.stringify(char, null, 2), { name: `episodes/${ep.episode_number}/characters/${char.id}.json` });
      // 概念图图片
      if (char.concept_images) {
        try {
          const images = JSON.parse(char.concept_images) as Array<{ url: string }>;
          for (const img of images) {
            const localPath = projectStorage.toLocalPath(img.url);
            if (fs.existsSync(localPath)) {
              archive.file(localPath, { name: `episodes/${ep.episode_number}/characters/${char.id}/${path.basename(localPath)}` });
            }
          }
        } catch { /* ignore */ }
      }
    }

    // 3.2 scenes/
    const scenes = ScriptSceneDAO.listByEpisode(db, ep.id);
    for (const scene of scenes) {
      archive.append(JSON.stringify(scene, null, 2), { name: `episodes/${ep.episode_number}/scenes/${scene.id}.json` });
      if (scene.concept_images) {
        try {
          const images = JSON.parse(scene.concept_images) as Array<{ url: string }>;
          for (const img of images) {
            const localPath = projectStorage.toLocalPath(img.url);
            if (fs.existsSync(localPath)) {
              archive.file(localPath, { name: `episodes/${ep.episode_number}/scenes/${scene.id}/${path.basename(localPath)}` });
            }
          }
        } catch { /* ignore */ }
      }
    }

    // 3.3 props/
    const props = ScriptPropDAO.listByEpisode(db, ep.id);
    for (const prop of props) {
      archive.append(JSON.stringify(prop, null, 2), { name: `episodes/${ep.episode_number}/props/${prop.id}.json` });
    }

    // 3.4 shots/
    const shots = ShotDAO.listByEpisode(db, ep.id);
    for (const shot of shots) {
      archive.append(JSON.stringify(shot, null, 2), { name: `episodes/${ep.episode_number}/shots/${shot.id}.json` });
      const keyframes = ShotKeyframeDAO.listByShot(db, shot.id);
      for (const kf of keyframes) {
        archive.append(JSON.stringify(kf, null, 2), { name: `episodes/${ep.episode_number}/shots/${shot.id}/keyframes/${kf.id}.json` });
        if (kf.image_url) {
          const localPath = projectStorage.toLocalPath(kf.image_url);
          if (fs.existsSync(localPath)) {
            archive.file(localPath, { name: `episodes/${ep.episode_number}/shots/${shot.id}/keyframes/${path.basename(localPath)}` });
          }
        }
      }

      // 3.4.2 videos/
      const videos = ShotVideoIntervalDAO.listByShot(db, shot.id);
      for (const video of videos) {
        archive.append(JSON.stringify(video, null, 2), { name: `episodes/${ep.episode_number}/shots/${shot.id}/videos/${video.id}.json` });
        if (video.video_url && !video.video_url.startsWith('http')) {
          const localPath = projectStorage.toLocalPath(video.video_url);
          if (fs.existsSync(localPath)) {
            archive.file(localPath, { name: `episodes/${ep.episode_number}/shots/${shot.id}/videos/${path.basename(localPath)}` });
          }
        }
      }
    }
  }

  // 4. manifest.json
  const manifest = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    projectId,
    counts: {
      chapters: chapters.length,
      episodes: episodes.length,
    },
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

  await archive.finalize();
  return stream;
}
