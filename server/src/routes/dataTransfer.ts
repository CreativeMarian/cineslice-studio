// 数据导出/导入路由
// v2.0 — 增加自定义导出格式

import { Router, Request, Response } from 'express';
import {
  ProjectDAO,
  NovelEpisodeDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  ShotDAO,
} from '../models';
import { createError, asyncHandler } from '../middleware/errorHandler';
import { zipUpload } from '../middleware/upload';
import { exportProject } from '../services/exportService';
import { importProject } from '../services/importService';
import type { Database } from '../types';

const router = Router();

function getDb(req: Request): Database {
  return req.app.locals.db as Database;
}

// 导出项目 ZIP
router.post('/projects/:id/export', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const stream = await exportProject(db, req.params.id, req.user.id);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="cineslice-studio-${req.params.id}.zip"`);
  stream.pipe(res);
}));

// 自定义导出（剧本/分镜/角色/场景，多种格式）
router.get('/projects/:id/export-custom', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  const project = ProjectDAO.getByIdAndUser(db, req.params.id, req.user.id);
  if (!project) throw createError(404, 'NOT_FOUND', '项目不存在');

  const type = (req.query.type as string) || 'script';
  const format = (req.query.format as string) || 'txt';
  const episodeId = req.query.episodeId as string | undefined;

  let content = '';
  let contentType = 'text/plain; charset=utf-8';
  let filename = `moo-${type}-${req.params.id}.${format}`;

  const episodes = episodeId
    ? NovelEpisodeDAO.listByProject(db, req.params.id).filter(e => e.id === episodeId)
    : NovelEpisodeDAO.listByProject(db, req.params.id);

  if (type === 'script') {
    // 剧本导出
    const scriptParts: string[] = [];
    scriptParts.push(`# ${project.title}\n`);
    if (project.description) scriptParts.push(`${project.description}\n`);
    for (const ep of episodes) {
      scriptParts.push(`\n## 第${ep.episode_number}集：${ep.title}\n`);
      scriptParts.push(ep.script_content || '');
    }
    content = scriptParts.join('\n');

    if (format === 'json') {
      content = JSON.stringify(episodes.map(e => ({
        episode_number: e.episode_number,
        title: e.title,
        script_content: e.script_content,
        word_count: e.word_count,
      })), null, 2);
      contentType = 'application/json; charset=utf-8';
    } else if (format === 'fdx') {
      // Final Draft XML 简化格式
      content = `<?xml version="1.0" encoding="UTF-8"?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">
<Content>
${episodes.map(ep => `  <Paragraph Type="Scene Heading"><Text>第${ep.episode_number}集 ${ep.title}</Text></Paragraph>
  <Paragraph Type="Action"><Text>${(ep.script_content || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!)).slice(0, 5000)}</Text></Paragraph>`).join('\n')}
</Content>
</FinalDraft>`;
      contentType = 'application/xml; charset=utf-8';
    } else if (format === 'html' || format === 'pdf') {
      content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${project.title}</title>
<style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.8}
h1{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}
h2{color:#444;margin-top:30px;border-left:4px solid #e0a83e;padding-left:10px}
p{text-indent:2em;margin:8px 0}
@media print{body{margin:20px}}</style></head><body>
<h1>${project.title}</h1>
${project.description ? `<p style="text-align:center;color:#666">${project.description}</p>` : ''}
${episodes.map(ep => `<h2>第${ep.episode_number}集：${ep.title}</h2><div>${(ep.script_content || '').replace(/\n/g, '<br>')}</div>`).join('')}
</body></html>`;
      contentType = 'text/html; charset=utf-8';
      filename = `moo-${type}-${req.params.id}.html`;
    }
  } else if (type === 'storyboard') {
    // 分镜表导出
    const allShots: any[] = [];
    for (const ep of episodes) {
      const shots = ShotDAO.listByEpisode(db, ep.id);
      for (const shot of shots) {
        allShots.push({ episode: ep.episode_number, ...shot });
      }
    }

    if (format === 'json') {
      content = JSON.stringify(allShots, null, 2);
      contentType = 'application/json; charset=utf-8';
    } else if (format === 'xlsx' || format === 'csv') {
      const headers = ['集数', '镜头号', '景别', '镜头运动', '动作描述', '对话', '时长(秒)', '角色'];
      const rows = allShots.map(s => [
        s.episode, s.shot_number, s.shot_size, s.camera_movement,
        (s.action_description || '').replace(/[",\n]/g, ' '),
        (s.dialogue || '').replace(/[",\n]/g, ' '),
        s.duration_seconds, s.characters_in_shot ? JSON.stringify(s.characters_in_shot) : '',
      ]);
      content = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      contentType = 'text/csv; charset=utf-8';
      filename = `moo-${type}-${req.params.id}.csv`;
    } else if (format === 'html' || format === 'pdf') {
      content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>分镜表 - ${project.title}</title>
<style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}
th{background:#f5f5f5}tr:nth-child(even){background:#fafafa}</style></head><body>
<h1>分镜表 - ${project.title}</h1>
<table><tr><th>集数</th><th>镜头</th><th>景别</th><th>运动</th><th>动作描述</th><th>对话</th><th>时长</th></tr>
${allShots.map(s => `<tr><td>${s.episode}</td><td>${s.shot_number}</td><td>${s.shot_size}</td><td>${s.camera_movement}</td><td>${s.action_description || ''}</td><td>${s.dialogue || ''}</td><td>${s.duration_seconds}s</td></tr>`).join('')}
</table></body></html>`;
      contentType = 'text/html; charset=utf-8';
      filename = `moo-${type}-${req.params.id}.html`;
    } else {
      content = allShots.map(s =>
        `【第${s.episode}集 镜头${s.shot_number}】景别:${s.shot_size} 运动:${s.camera_movement} 时长:${s.duration_seconds}s\n动作: ${s.action_description}\n对话: ${s.dialogue}\n`
      ).join('\n');
    }
  } else if (type === 'characters') {
    // 角色设定导出
    const allChars: any[] = [];
    for (const ep of episodes) {
      const chars = ScriptCharacterDAO.listByEpisode(db, ep.id);
      for (const c of chars) allChars.push({ episode: ep.episode_number, ...c });
    }

    if (format === 'json') {
      content = JSON.stringify(allChars, null, 2);
      contentType = 'application/json; charset=utf-8';
    } else if (format === 'html' || format === 'pdf') {
      content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>角色设定 - ${project.title}</title>
<style>body{font-family:Arial,sans-serif;margin:20px}.char{border:1px solid #ddd;border-radius:8px;padding:15px;margin:10px 0}
h2{color:#333}.tag{display:inline-block;background:#e0a83e;color:white;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:5px}</style></head><body>
<h1>角色设定 - ${project.title}</h1>
${allChars.map(c => `<div class="char"><h2>${c.name} <span class="tag">${c.role_type}</span> <span class="tag">${c.gender}</span></h2>
<p><strong>身份：</strong>${c.description || '无'}</p>
<p><strong>外貌：</strong>${c.visual_description || '无'}</p></div>`).join('')}
</body></html>`;
      contentType = 'text/html; charset=utf-8';
      filename = `moo-${type}-${req.params.id}.html`;
    } else {
      content = allChars.map(c =>
        `【${c.name}】类型:${c.role_type} 性别:${c.gender}\n身份: ${c.description}\n外貌: ${c.visual_description}\n`
      ).join('\n');
    }
  } else if (type === 'scenes') {
    // 场景设定导出
    const allScenes: any[] = [];
    for (const ep of episodes) {
      const scenes = ScriptSceneDAO.listByEpisode(db, ep.id);
      for (const s of scenes) allScenes.push({ episode: ep.episode_number, ...s });
    }

    if (format === 'json') {
      content = JSON.stringify(allScenes, null, 2);
      contentType = 'application/json; charset=utf-8';
    } else if (format === 'html' || format === 'pdf') {
      content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>场景设定 - ${project.title}</title>
<style>body{font-family:Arial,sans-serif;margin:20px}.scene{border:1px solid #ddd;border-radius:8px;padding:15px;margin:10px 0}
h2{color:#333}.tag{display:inline-block;background:#5e8cff;color:white;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:5px}</style></head><body>
<h1>场景设定 - ${project.title}</h1>
${allScenes.map(s => `<div class="scene"><h2>${s.name} <span class="tag">${s.time_of_day}</span> <span class="tag">${s.atmosphere || '氛围'}</span></h2>
<p><strong>地点：</strong>${s.location || '无'}</p>
<p><strong>描述：</strong>${s.description || '无'}</p></div>`).join('')}
</body></html>`;
      contentType = 'text/html; charset=utf-8';
      filename = `moo-${type}-${req.params.id}.html`;
    } else {
      content = allScenes.map(s =>
        `【${s.name}】地点:${s.location} 时段:${s.time_of_day} 氛围:${s.atmosphere}\n描述: ${s.description}\n`
      ).join('\n');
    }
  } else {
    throw createError(400, 'INVALID_TYPE', `不支持的导出类型: ${type}`);
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(content);
}));

// 导入项目 ZIP
router.post('/projects/import', zipUpload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const db = getDb(req);
  if (!req.file) throw createError(400, 'VALIDATION_ERROR', '请上传 ZIP 文件');

  const result = await importProject(db, req.file.path, req.user.id);
  res.json({
    success: true,
    data: {
      project: result.project,
      chaptersCount: result.chaptersCount,
      episodesCount: result.episodesCount,
    },
  });
}));

export default router;
