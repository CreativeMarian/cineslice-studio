// API 路由连通性测试
// 验证前端服务层调用的所有 API 路径都有对应的后端路由

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// 前端服务层调用的 API 路径
const frontendApiCalls = [
  // videoService
  { method: 'POST', path: '/shots/:id/video/generate' },
  { method: 'GET', path: '/videos/:id/status' },
  { method: 'GET', path: '/shots/:id/videos' },
  { method: 'DELETE', path: '/videos/:id' },
  { method: 'GET', path: '/shots/:id/keyframes' },
  { method: 'POST', path: '/shots/:id/keyframes/generate' },
  // taskService
  { method: 'GET', path: '/tasks' },
  { method: 'GET', path: '/tasks/:id' },
  { method: 'POST', path: '/tasks/:id/cancel' },
  // shotService
  { method: 'POST', path: '/episodes/:id/shots/generate' },
  { method: 'GET', path: '/episodes/:id/shots' },
  { method: 'PUT', path: '/shots/:id' },
  { method: 'DELETE', path: '/shots/:id' },
  { method: 'POST', path: '/keyframes/:id/regenerate' },
  // projectService
  { method: 'GET', path: '/projects' },
  { method: 'POST', path: '/projects' },
  { method: 'GET', path: '/projects/:id' },
  { method: 'PUT', path: '/projects/:id' },
  { method: 'DELETE', path: '/projects/:id' },
  { method: 'POST', path: '/projects/:id/novel/upload' },
  { method: 'GET', path: '/projects/:id/chapters' },
  { method: 'PUT', path: '/projects/:id/chapters/:cid' },
  { method: 'POST', path: '/projects/:id/episodes/generate' },
  { method: 'GET', path: '/projects/:id/episodes' },
  { method: 'GET', path: '/episodes/:id' },
  { method: 'PUT', path: '/episodes/:id' },
  { method: 'POST', path: '/episodes/:id/regenerate' },
  // preferenceService
  { method: 'GET', path: '/preferences' },
  { method: 'PUT', path: '/preferences' },
  // authService
  { method: 'POST', path: '/auth/register' },
  { method: 'POST', path: '/auth/login' },
  { method: 'GET', path: '/auth/me' },
  { method: 'PUT', path: '/auth/profile' },
  { method: 'PUT', path: '/auth/password' },
  // modelConfigService
  { method: 'GET', path: '/models' },
  { method: 'GET', path: '/models/available' },
  { method: 'POST', path: '/models' },
  { method: 'DELETE', path: '/models/:id' },
  { method: 'POST', path: '/models/:id/test' },
  { method: 'PUT', path: '/models/:id/default' },
  // assetService
  { method: 'POST', path: '/episodes/:id/characters/extract' },
  { method: 'GET', path: '/episodes/:id/characters' },
  { method: 'PUT', path: '/characters/:id' },
  { method: 'POST', path: '/characters/:id/generate-image' },
  { method: 'POST', path: '/characters/:id/upload-reference' },
  { method: 'DELETE', path: '/characters/:id' },
  { method: 'POST', path: '/episodes/:id/scenes/extract' },
  { method: 'GET', path: '/episodes/:id/scenes' },
  { method: 'GET', path: '/scenes/:id' },
  { method: 'PUT', path: '/scenes/:id' },
  { method: 'POST', path: '/scenes/:id/generate-image' },
  { method: 'DELETE', path: '/scenes/:id' },
  { method: 'GET', path: '/episodes/:id/props' },
  { method: 'POST', path: '/episodes/:id/props' },
  { method: 'PUT', path: '/props/:id' },
  { method: 'DELETE', path: '/props/:id' },
  // exportService
  { method: 'POST', path: '/projects/:id/export' },
  { method: 'POST', path: '/projects/import' },
];

// 路由前缀映射（从 index.ts 中提取）
const routePrefixes: Record<string, string> = {
  'auth.ts': '/api/auth',
  'projects.ts': '/api/projects',
  'assets.ts': '/api',
  'episodes.ts': '/api',
  'models.ts': '/api/models',
  'dataTransfer.ts': '/api',
  'preferences.ts': '/api/preferences',
  'visualStyles.ts': '/api/visual-styles',
  'tasks.ts': '/api/tasks',
  'ai.ts': '/api/ai',
  'projectPatch.ts': '/api/project-patch',
};

// 从后端路由文件中提取所有路由（含完整路径）
function extractBackendRoutes(): { method: string; path: string; file: string }[] {
  const routesDir = path.resolve(__dirname, '../../server/src/routes');
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));
  const routes: { method: string; path: string; file: string }[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
    const prefix = routePrefixes[file] || '/api';
    const regex = /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const relativePath = match[2];
      const fullPath = prefix + (relativePath === '/' ? '' : relativePath);
      routes.push({
        method: match[1].toUpperCase(),
        path: fullPath,
        file,
      });
    }
  }
  return routes;
}

// 将路径中的 :param 转换为正则
function pathToRegex(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

describe('API 路由连通性', () => {
  const backendRoutes = extractBackendRoutes();

  it('后端应定义至少 60 个路由', () => {
    expect(backendRoutes.length).toBeGreaterThanOrEqual(60);
  });

  it('前端调用的所有 API 路径都应有对应的后端路由', () => {
    const missing: string[] = [];

    for (const call of frontendApiCalls) {
      const fullPath = '/api' + call.path;
      const regex = pathToRegex(fullPath);
      const found = backendRoutes.some(r =>
        r.method === call.method && regex.test(r.path)
      );
      if (!found) {
        missing.push(`${call.method} ${call.path}`);
      }
    }

    if (missing.length > 0) {
      console.error('缺失的后端路由:', missing);
    }
    expect(missing).toEqual([]);
  });

  it('同一文件内不应有重复路由', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const r of backendRoutes) {
      const key = `${r.file}:${r.method} ${r.path}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.set(key, r.file);
    }
    if (duplicates.length > 0) {
      console.error('重复的路由定义:', duplicates);
    }
    expect(duplicates).toEqual([]);
  });

  it('视频生成相关路由应完整', () => {
    const videoRoutes = backendRoutes.filter(r =>
      r.path.includes('video') || r.path.includes('videos')
    );
    const paths = videoRoutes.map(r => `${r.method} ${r.path}`);
    expect(paths.some(p => p.includes('video/generate'))).toBe(true);
    expect(paths.some(p => p.includes('videos/:id/status'))).toBe(true);
    expect(paths.some(p => p.includes('shots/:id/videos'))).toBe(true);
    expect(paths.some(p => p.includes('videos/:id') && p.startsWith('DELETE'))).toBe(true);
  });

  it('关键帧相关路由应完整', () => {
    const keyframeRoutes = backendRoutes.filter(r =>
      r.path.includes('keyframe') || r.path.includes('keyframes')
    );
    const paths = keyframeRoutes.map(r => `${r.method} ${r.path}`);
    expect(paths.some(p => p.includes('keyframes/generate'))).toBe(true);
    expect(paths.some(p => p.includes('shots/:id/keyframes'))).toBe(true);
    expect(paths.some(p => p.includes('keyframes/:id/regenerate'))).toBe(true);
    expect(paths.some(p => p.includes('keyframes/:id') && p.startsWith('DELETE'))).toBe(true);
  });

  it('导出接口应使用 POST 方法（匹配前端调用）', () => {
    const exportRoute = backendRoutes.find(r =>
      r.path.includes('projects/:id/export')
    );
    expect(exportRoute).toBeDefined();
    expect(exportRoute?.method).toBe('POST');
  });
});
