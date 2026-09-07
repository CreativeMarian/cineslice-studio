// 配音 + 字幕服务
// v1.0 - edge-tts 免费中文语音 + ffmpeg 混音 + 字幕烧录
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { AIError } from './adapters/base';

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
 * 对镜头视频执行配音 + 字幕烧录
 * @param videoPath 原始视频绝对路径
 * @param dialogue 台词（含角色名）
 * @param projectDir 项目数据目录（存放产物）
 */
export async function dubVideo(
  videoPath: string,
  dialogue: string | null | undefined,
  projectDir: string
): Promise<DubResult | null> {
  const dialogueText = extractDialogueText(dialogue);
  if (!dialogueText || !fs.existsSync(videoPath)) return null;

  const voice = pickVoice(dialogueText);
  const stem = `dub_${Date.now()}`;
  const voicePath = path.join(projectDir, `${stem}_voice.mp3`);
  const srtPath = path.join(projectDir, `${stem}.srt`);
  const outPath = path.join(projectDir, `${stem}.mp4`);

  await synthVoice(dialogueText, voice, voicePath);
  const dur = await audioDuration(voicePath);
  fs.writeFileSync(srtPath, buildSrt(dialogueText, dur), 'utf-8');

  // ffmpeg：视频 + 语音混音 + 烧录字幕（底部白字黑边）
  const srtEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const vf = `subtitles='${srtEscaped}':force_style='FontName=Microsoft YaHei,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,MarginV=28'`;
  const filter = `[1:a]aresample=48000[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
  const args = [
    '-y', '-i', videoPath, '-i', voicePath,
    '-filter_complex', filter,
    '-map', '0:v', '-map', '[aout]',
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k', '-shortest',
    outPath,
  ];
  await execFileP('ffmpeg', args, { timeout: 300000 });

  return { videoPath: outPath, srtPath, voicePath, voiceUsed: voice, dialogueText, durationSec: dur };
}

export { AIError };
