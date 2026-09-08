// 配音 + 字幕服务
// v1.0 - edge-tts 免费中文语音 + ffmpeg 混音 + 字幕烧录
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { AIError } from './adapters/base';
import type { Database } from '../types';
import { aiProxy } from './aiProxy';
import { resolveVoiceForShot, adjustSpeedByEmotion } from './voiceAssignment';
import { downloadToFile } from '../utils/download';

const execFileP = promisify(execFile);
const PROJECT_DIR = path.resolve(process.cwd(), 'data');

// 角色 → 音色映射（edge-tts 中文神经语音）
const VOICE_MAP: Array<[RegExp, string]> = [
  [/刘桂芬|清禾|赵清禾|母亲|妈|女性|woman|female/i, 'zh-CN-XiaoxiaoNeural'],
  [/赵国梁|父亲|爸|男性|man|male/i, 'zh-CN-YunxiNeural'],
];
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

export function pickVoice(text: string): string {
  for (const [re, v] of VOICE_MAP) {
    if (re.test(text)) return v;
  }
  return DEFAULT_VOICE;
}

// 提取台词纯文本（去掉"角色："前缀，保留对话）
export function extractDialogueText(dialogue: string | null | undefined): string {
  if (!dialogue) return '';
  return dialogue.replace(/^[^：:"]*[：:]\s*/, '').replace(/^"|"$/g, '').trim();
}

export interface DubResult {
  videoPath: string;
  srtPath: string;
  voicePath: string;
  voiceUsed: string;
  dialogueText: string;
  durationSec: number;
}

async function pythonExec(args: string[]): Promise<string> {
  const { stdout } = await execFileP('python', args, { timeout: 120000 });
  return stdout;
}

// 用 edge-tts 生成语音（mp3）
async function synthVoice(text: string, voice: string, outPath: string): Promise<void> {
  const script = `
import asyncio, sys, edge_tts
async def main():
    c = edge_tts.Communicate(sys.argv[1], sys.argv[2], rate='-5%')
    await c.save(sys.argv[3])
asyncio.run(main())
`;
  const scriptPath = path.join(PROJECT_DIR, '.tts_script.py');
  fs.writeFileSync(scriptPath, script, 'utf-8');
  try {
    await pythonExec([scriptPath, text, voice, outPath]);
  } finally {
    try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

// 获取音频时长（ffprobe）
async function audioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileP('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

// 生成 SRT（单条台词，按语音时长）
function buildSrt(text: string, dur: number, startOffset = 0): string {
  const fmt = (t: number) => {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.floor((t % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  const end = Math.max(startOffset + dur, startOffset + 1);
  return `1\n${fmt(startOffset)} --> ${fmt(end)}\n${text}\n`;
}

/**
 * 对镜头视频执行配音 + 字幕烧录（替换音轨：去掉模型幻觉音频，只用 TTS 普通话；字幕上移避开原字幕区）
 * @param videoPath 原始视频绝对路径
 * @param dialogue 台词（含角色名）
 * @param projectDir 项目数据目录（存放产物）
 * @param stem 产物文件名前缀（默认 dub_时间戳；固定 stem 可复用产物）
 */
export interface DubOptions {
  db?: Database;
  userId?: string;
  episodeId?: string;
  /** 用户配置的音频模型 key（provider:modelName）。存在时优先走该模型 + 角色音色档案；否则回退 edge-tts */
  audioModelKey?: string;
}

/**
 * 对镜头视频执行配音 + 字幕烧录（替换音轨：去掉模型幻觉音频，只用 TTS 普通话；字幕上移避开原字幕区）
 * v1.1 - 支持走用户配置的音频模型（豆包 TTS 等）：音色来自角色 voice_profile，语速按情绪调整，
 *        与手动"配音"页路径完全一致；未配置时回退 edge-tts 免费语音
 */
export async function dubVideo(
  videoPath: string,
  dialogue: string | null | undefined,
  projectDir: string,
  stem?: string,
  opts?: DubOptions
): Promise<DubResult | null> {
  const dialogueText = extractDialogueText(dialogue);
  if (!dialogueText || !fs.existsSync(videoPath)) return null;

  const base = stem || `dub_${Date.now()}`;
  const voicePath = path.join(projectDir, `${base}_voice.mp3`);
  const srtPath = path.join(projectDir, `${base}.srt`);
  const outPath = path.join(projectDir, `${base}.mp4`);

  // 产物已存在则直接复用（幂等）
  if (fs.existsSync(outPath)) {
    const dur = fs.existsSync(voicePath) ? await audioDuration(voicePath) : 0;
    return { videoPath: outPath, srtPath, voicePath, voiceUsed: 'cached', dialogueText, durationSec: dur };
  }

  let dur = 0;
  const useConfiguredModel = opts?.db && opts?.userId && opts?.audioModelKey;
  if (useConfiguredModel) {
    // 走用户配置的音频模型：音色 = 角色 voice_profile（跨镜头一致），语速 = 性格基线 + 镜头情绪调整
    try {
      const key = opts!.audioModelKey as string;
      const [provider, ...rest] = key.split(':');
      const modelName = rest.join(':');
      const assigned = resolveVoiceForShot(opts!.db!, opts!.episodeId || '', dialogueText);
      const speed = adjustSpeedByEmotion(dialogueText, '', assigned.speed);
      const result = await aiProxy.generateAudio({
        db: opts!.db!,
        userId: opts!.userId!,
        provider,
        modelName,
        text: dialogueText,
        voice: assigned.voice,
        speed,
      });
      await downloadToFile(result.audioUrl, voicePath, { timeoutMs: 30_000, maxBytes: 20 * 1024 * 1024 });
      dur = await audioDuration(voicePath);
    } catch (err) {
      console.warn(`[Dub] 配置模型配音失败，回退 edge-tts: ${(err as Error).message}`);
      await synthVoice(dialogueText, pickVoice(dialogueText), voicePath);
      dur = await audioDuration(voicePath);
    }
  } else {
    // 未配置音频模型：edge-tts 免费语音
    await synthVoice(dialogueText, pickVoice(dialogueText), voicePath);
    dur = await audioDuration(voicePath);
  }

  fs.writeFileSync(srtPath, buildSrt(dialogueText, dur), 'utf-8');

  // ffmpeg：视频画面 + TTS 音轨（替换原音轨）+ 烧录字幕
  // 字幕上移（MarginV=110，在画面下部 1/6 处），避开模型自带底部乱码字幕区
  const srtEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const vf = `subtitles='${srtEscaped}':force_style='FontName=Microsoft YaHei,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=110'`;
  const args = [
    '-y', '-i', videoPath, '-i', voicePath,
    '-map', '0:v', '-map', '1:a',
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-shortest',
    outPath,
  ];
  await execFileP('ffmpeg', args, { timeout: 300000 });

  return { videoPath: outPath, srtPath, voicePath, voiceUsed: useConfiguredModel ? 'configured' : 'edge-tts', dialogueText, durationSec: dur };
}

/**
 * 无台词镜头：去除模型幻觉音轨，输出静音版本（保留画面）
 */
export async function muteVideo(videoPath: string, projectDir: string, stem: string): Promise<string | null> {
  if (!fs.existsSync(videoPath)) return null;
  const outPath = path.join(projectDir, `${stem}.mp4`);
  if (fs.existsSync(outPath)) return outPath;
  const args = ['-y', '-i', videoPath, '-map', '0:v', '-an', '-c:v', 'copy', outPath];
  await execFileP('ffmpeg', args, { timeout: 180000 });
  return outPath;
}

export { AIError };
