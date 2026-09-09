// 阶段8：配音批量生成（TTS）—— 按角色分配音色
// v2.1 - 改用共享音色分配模块（voiceAssignment.ts），与手动路径保持一致
import fs from 'fs';
import path from 'path';
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ShotDAO, ScriptCharacterDAO, ShotAudioDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { downloadToFile } from '../../../utils/download';
import { projectStorage } from '../../projectStorage';
import {
  parseSpeaker,
  stripSpeakerPrefix,
  resolveVoiceForCharacter,
  adjustSpeedByEmotion,
} from '../../voiceAssignment';
import type { AutoPipelineTask } from '../types';
import { getFirstModel } from '../helpers';

export async function stageAudio(db: Database, task: AutoPipelineTask): Promise<void> {
  const episodes = NovelEpisodeDAO.listByProject(db, task.projectId);
  const first = episodes[0];
  if (!first) throw new Error('无可用剧集');

  const shots = ShotDAO.listByEpisode(db, first.id);
  const targetShots = shots.filter(s => s.dialogue && s.dialogue.trim().length > 0);

  if (targetShots.length === 0) {
    task.stageProgress['audio'] = '无对话镜头，跳过';
    return;
  }

  const model = getFirstModel(db, task.userId, 'audio');
  if (!model) throw new Error('请先配置音频模型');

  // 预加载所有角色信息，用于按角色分配音色
  const allCharacters = ScriptCharacterDAO.listByEpisode(db, first.id);
  const characterNameMap = new Map(allCharacters.map(c => [c.name, c]));

  const audioDir = projectStorage.getAudioDir(task.projectId);
  projectStorage.ensureDir(audioDir);

  let generated = 0;
  let failed = 0;

  for (const shot of targetShots) {
    try {
      // 解析说话者并分配音色（voice_profile 优先，其次按角色性格+镜头情绪动态分配）
      const speaker = parseSpeaker(shot.dialogue);
      const char = speaker ? characterNameMap.get(speaker) : undefined;
      const { voice: baseVoice, speed: baseSpeed } = resolveVoiceForCharacter(char);
      // 根据镜头情绪进一步调整语速
      const finalSpeed = adjustSpeedByEmotion(shot.dialogue, shot.action_description || '', baseSpeed);

      // 去除对话中的角色名前缀，只保留对话内容
      const dialogueText = stripSpeakerPrefix(shot.dialogue);

      const result = await aiProxy.generateAudio({
        db, userId: task.userId,
        provider: model.provider, modelName: model.modelName,
        text: dialogueText, voice: baseVoice, speed: finalSpeed,
      });

      const fileName = `tts_shot_${shot.shot_number}_${Date.now()}.mp3`;
      const localPath = path.resolve(audioDir, fileName);
      if (/^https?:\/\//.test(result.audioUrl)) {
        // 适配器可能返回音频文件 URL（如 MiniMax audio_file），直接下载为二进制；
        // 旧逻辑把 URL 文本当 base64 解码，产出损坏的 mp3
        await downloadToFile(result.audioUrl, localPath, { timeoutMs: 60_000, maxBytes: 50 * 1024 * 1024 });
      } else {
        const base64Data = result.audioUrl.includes(',') ? result.audioUrl.split(',')[1] : result.audioUrl;
        fs.writeFileSync(localPath, Buffer.from(base64Data, 'base64'));
      }
      // 落盘校验：0 字节文件会让后续合成阶段莫名失败
      if (fs.existsSync(localPath) && fs.statSync(localPath).size === 0) {
        throw new Error('TTS 写入了空音频文件');
      }
      // 结构化入库（v3.0）：按镜头 upsert，清理旧配音文件
      const oldRecords = ShotAudioDAO.listByShot(db, shot.id);
      ShotAudioDAO.upsertByShot(db, {
        user_id: task.userId,
        project_id: task.projectId,
        episode_id: first.id,
        shot_id: shot.id,
        shot_number: shot.shot_number,
        file_name: fileName,
        voice: baseVoice,
        speed: finalSpeed,
        duration_seconds: result.durationSeconds ?? undefined,
        source: 'auto',
      });
      for (const old of oldRecords) {
        if (old.file_name && old.file_name !== fileName) {
          try {
            const oldPath = path.resolve(audioDir, old.file_name);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          } catch { /* 忽略清理失败 */ }
        }
      }
      generated++;
      task.stageProgress['audio'] = `生成中 ${generated}/${targetShots.length}（${speaker || '未知'}: ${baseVoice}）`;
    } catch (err: any) {
      console.error(`[AutoPipeline] tts shot=${shot.id} failed:`, err.message);
      failed++;
    }
  }

  if (generated === 0) {
    // 配音全部失败时不阻塞流水线，警告后继续到视频生成阶段
    console.warn("[AutoPipeline] 配音生成全部失败，继续执行视频生成阶段");
    task.stageProgress["audio"] = `全部失败（${failed} 条），已跳过继续`;
  } else {
    task.stageProgress["audio"] = `生成 ${generated} 条，失败 ${failed} 条`;
  }
}
