// shuohao-skills 原生 JSON 模式校验执行器
// 真实运行 vendor 里的 novel-*.mjs validate 脚本（Node 18+，零依赖），
// 把 MOO 数据经 converters.ts 转成 skill 原生 JSON 后喂给官方校验器，
// 解析 stdout/stderr 为 GateResult，供流水线 stageProgress 展示。
// 设计：校验失败不阻断流水线（与 gates.ts 同策略，结果只读）。

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import type { Database } from '../../types';
import { ShotDAO, ScriptCharacterDAO, ScriptSceneDAO, ScriptPropDAO, NovelEpisodeDAO } from '../../models';
import {
  buildIdMaps, buildScriptJson, buildCastJson, buildArtJson, buildStoryboardJson, buildBookTxt,
} from './converters';
import type { GateResult, GateIssue } from './gates';

const execFileAsync = promisify(execFile);

const VENDOR_ROOT = path.resolve(__dirname, 'vendor');
const GATES_DIR = path.resolve(__dirname, '../../../data/.shuohao-gates');

export type NativeStage = 'shots' | 'characters' | 'scenes';

export interface NativeGateOutcome {
  executed: boolean;
  result?: GateResult;
  /** 生成的原生 JSON 文件路径（保留供调试/审计） */
  artifacts?: Record<string, string>;
}

function skillDirFor(s: NativeStage): string {
  // shots → novel-storyboard；characters → novel-characters；scenes → novel-art
  if (s === 'shots') return 'novel-storyboard';
  if (s === 'characters') return 'novel-characters';
  return 'novel-art';
}

function parseValidateOutput(stage: NativeStage, stdout: string, stderr: string, exitCode: number): GateResult {
  const issues: GateIssue[] = [];
  if (exitCode === 0) {
    const okLine = stdout.split('\n').map(l => l.trim()).find(l => l.startsWith('✓'));
    return { stage, passed: true, issues: [], summary: okLine || '✓ 原生校验通过' };
  }
  // 违规在 stderr，形如：`✗ 3 处违规（stage=full）：` + `  问题行`
  const lines = stderr.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line || line.startsWith('✗') && line.includes('处违规')) continue;
    const msg = line.replace(/^[✗•\-]\s*/, '').replace(/\s*$/, '');
    if (msg && !/^用法：/.test(msg)) {
      issues.push({ rule: `shuohao-${stage}`, message: msg.slice(0, 200), severity: 'warn' });
    }
  }
  if (issues.length === 0 && exitCode !== 0) {
    issues.push({ rule: `shuohao-${stage}`, message: stderr.slice(0, 200) || '校验脚本退出码非 0', severity: 'warn' });
  }
  const failedLine = stdout.split('\n').map(l => l.trim()).find(l => l.startsWith('✗') || l.includes('未过'));
  return { stage, passed: false, issues, summary: failedLine || `✗ 原生校验未通过（${issues.length} 条）` };
}

async function runScript(
  scriptPath: string,
  args: string[],
  timeoutMs = 30000
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, ...args], {
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err: any) {
    if (err && typeof err.code === 'number') {
      return { code: err.code, stdout: String(err.stdout || ''), stderr: String(err.stderr || '') };
    }
    return { code: -1, stdout: '', stderr: String(err?.message || err) };
  }
}

function writeJson(file: string, doc: any): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8');
}

/**
 * 对指定阶段真实运行 shuohao 原生 validate。
 * shots → novel-storyboard validate <storyboard.json> --script <script.json> --cast <cast.json>
 * characters → novel-characters validate <cast.json> <book.txt>
 * scenes → novel-art validate <art.json> --cast <cast.json>
 * 返回 executed=false 表示脚本无法执行（如 node 缺失），调用方应降级但不阻断。
 */
export async function runNativeGates(
  db: Database,
  stage: NativeStage,
  opts: { episodeId: string; projectId?: string }
): Promise<NativeGateOutcome> {
  const { episodeId, projectId } = opts;
  const episode = NovelEpisodeDAO.getById(db, episodeId);
  if (!episode) {
    return { executed: false, result: { stage, passed: false, issues: [{ rule: `shuohao-${stage}`, message: '剧集不存在', severity: 'warn' }], summary: '✗ 剧集不存在，跳过原生校验' } };
  }

  const characters = ScriptCharacterDAO.listByEpisode(db, episodeId);
  const scenes = ScriptSceneDAO.listByEpisode(db, episodeId);
  const props = ScriptPropDAO.listByEpisode(db, episodeId);
  const shots = ShotDAO.listByEpisode(db, episodeId);
  const maps = buildIdMaps(characters, scenes, props);

  const outDir = path.join(GATES_DIR, episodeId);
  fs.mkdirSync(outDir, { recursive: true });
  const artifacts: Record<string, string> = {};

  // cast.json（characters 与 shots 的 --cast 共用）
  const castDoc = buildCastJson(episode, characters);
  const castPath = path.join(outDir, 'cast.json');
  writeJson(castPath, castDoc);
  artifacts.cast = castPath;

  // script.json + storyboard.json（shots 阶段）
  const { doc: scriptDoc, beatRanges } = buildScriptJson(db, episode, shots, maps);
  const scriptPath = path.join(outDir, 'script.json');
  writeJson(scriptPath, scriptDoc);
  artifacts.script = scriptPath;

  const storyboardPath = path.join(outDir, 'storyboard.json');
  writeJson(storyboardPath, buildStoryboardJson(episode, shots, maps, beatRanges));
  artifacts.storyboard = storyboardPath;

  // art.json（scenes 阶段）
  const artDoc = buildArtJson(episode, scenes, props);
  // 填入 S/P 编号
  artDoc.scenes.forEach((s: any, i: number) => { s.id = maps.sceneById[scenes[i]?.id] || `S${String(i + 1).padStart(2, '0')}`; });
  artDoc.props.forEach((p: any, i: number) => { p.id = maps.propById[props[i]?.id] || `P${String(i + 1).padStart(2, '0')}`; });
  const artPath = path.join(outDir, 'art.json');
  writeJson(artPath, artDoc);
  artifacts.art = artPath;

  // book.txt（characters 阶段）
  const bookTxtPath = path.join(outDir, 'book.txt');
  if (projectId) {
    const book = buildBookTxt(db, projectId);
    if (book) fs.writeFileSync(bookTxtPath, book, 'utf8');
  }
  if (!fs.existsSync(bookTxtPath)) fs.writeFileSync(bookTxtPath, '', 'utf8');
  artifacts.book = bookTxtPath;

  // 运行对应脚本
  const skill = skillDirFor(stage);
  const scriptName = skill === 'novel-art' ? 'novel-art.mjs' : `novel-${stage === 'shots' ? 'storyboard' : stage}.mjs`;
  const scriptPathMjs = path.join(VENDOR_ROOT, skill, 'scripts', scriptName);
  let args: string[];
  let displayStage: 'shots' | 'characters' | 'scenes' = stage;

  if (stage === 'characters') {
    args = ['validate', castPath, bookTxtPath];
  } else if (stage === 'scenes') {
    args = ['validate', artPath, '--cast', castPath];
  } else {
    args = ['validate', storyboardPath, '--script', scriptPath, '--cast', castPath];
  }

  const { code, stdout, stderr } = await runScript(scriptPathMjs, args);
  const result = parseValidateOutput(displayStage, stdout, stderr, code);
  return { executed: code !== -1, result, artifacts };
}
