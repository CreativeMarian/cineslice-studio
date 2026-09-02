// 阶段8：配音批量生成（TTS）—— 按角色分配音色
import fs from 'fs';
import path from 'path';
import type { Database } from '../../../types';
import { NovelEpisodeDAO, ShotDAO, ScriptCharacterDAO } from '../../../models';
import { aiProxy } from '../../aiProxy';
import { downloadToFile } from '../../../utils/download';
import { projectStorage } from '../../projectStorage';
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

  // ═══════════════════════════════════════════════════════════
  // 深度优化：音色分配策略 v2.0
  // 根据角色性别、类型、性格、年龄动态分配音色
  // 根据镜头情绪动态调整语速
  // ═══════════════════════════════════════════════════════════

  // 扩展音色库（豆包 TTS 支持的音色）
  const VOICE_LIBRARY = {
    // 女声
    female_qingxin: { voice: 'zh_female_qingxin', desc: '清新女声，适合年轻女主角' },
    female_wener: { voice: 'zh_female_wener', desc: '温柔女声，适合温柔/成熟女性' },
    female_tianmei: { voice: 'zh_female_tianmei', desc: '甜美女声，适合可爱/少女角色' },
    female_shenhou: { voice: 'zh_female_shenhou', desc: '深厚女声，适合成熟/威严女性' },
    // 男声
    male_qianhou: { voice: 'zh_male_qianhou', desc: '浑厚男声，适合成熟男主角' },
    male_xiaoshen: { voice: 'zh_male_xiaoshen', desc: '小生男声，适合年轻/阴险角色' },
    male_yangguang: { voice: 'zh_male_yangguang', desc: '阳光男声，适合开朗/正义角色' },
    male_chenwen: { voice: 'zh_male_chenwen', desc: '沉稳男声，适合中年/权威角色' },
  };

  // 根据角色信息动态选择音色
  const getVoiceForCharacter = (charName: string): { voice: string; speed: number } => {
    const char = characterNameMap.get(charName);
    if (!char) return { voice: 'zh_female_qingxin', speed: 1.0 }; // 默认

    const gender = char.gender || 'other';
    const roleType = char.role_type || 'supporting';
    const personality = (char.personality || '').toLowerCase();
    const age = char.age || '';

    // 默认语速
    let speed = 1.0;

    // 根据性格调整语速
    if (personality.includes('紧张') || personality.includes('焦虑') || personality.includes('急')) {
      speed = 1.15; // 紧张时语速稍快
    } else if (personality.includes('温柔') || personality.includes('平静') || personality.includes('沉稳')) {
      speed = 0.9; // 温柔/沉稳时语速稍慢
    } else if (personality.includes('愤怒') || personality.includes('激动')) {
      speed = 1.2; // 愤怒/激动时语速快
    } else if (personality.includes('悲伤') || personality.includes('难过')) {
      speed = 0.85; // 悲伤时语速慢
    }

    // 女性角色
    if (gender === 'female') {
      if (roleType === 'protagonist') {
        // 女主角：根据性格选择
        if (personality.includes('温柔') || personality.includes('成熟')) {
          return { voice: VOICE_LIBRARY.female_wener.voice, speed };
        } else if (personality.includes('可爱') || personality.includes('少女') || age.includes('少女')) {
          return { voice: VOICE_LIBRARY.female_tianmei.voice, speed };
        }
        return { voice: VOICE_LIBRARY.female_qingxin.voice, speed };
      } else if (roleType === 'antagonist') {
        // 女反派：温柔反差或深厚
        if (personality.includes('威严') || personality.includes('成熟')) {
          return { voice: VOICE_LIBRARY.female_shenhou.voice, speed };
        }
        return { voice: VOICE_LIBRARY.female_wener.voice, speed }; // 温柔反差
      }
      // 配角
      if (personality.includes('可爱') || personality.includes('少女')) {
        return { voice: VOICE_LIBRARY.female_tianmei.voice, speed };
      }
      return { voice: VOICE_LIBRARY.female_qingxin.voice, speed };
    }

    // 男性角色
    if (gender === 'male') {
      if (roleType === 'protagonist') {
        // 男主角：根据性格选择
        if (personality.includes('阳光') || personality.includes('开朗') || personality.includes('正义')) {
          return { voice: VOICE_LIBRARY.male_yangguang.voice, speed };
        } else if (personality.includes('沉稳') || personality.includes('成熟') || age.includes('中年')) {
          return { voice: VOICE_LIBRARY.male_chenwen.voice, speed };
        }
        return { voice: VOICE_LIBRARY.male_qianhou.voice, speed };
      } else if (roleType === 'antagonist') {
        // 男反派：小生或沉稳
        if (personality.includes('阴险') || personality.includes('年轻') || age.includes('青年')) {
          return { voice: VOICE_LIBRARY.male_xiaoshen.voice, speed };
        }
        return { voice: VOICE_LIBRARY.male_chenwen.voice, speed };
      }
      // 配角
      if (personality.includes('阳光') || personality.includes('开朗')) {
        return { voice: VOICE_LIBRARY.male_yangguang.voice, speed };
      } else if (personality.includes('年轻') || age.includes('青年')) {
        return { voice: VOICE_LIBRARY.male_xiaoshen.voice, speed };
      }
      return { voice: VOICE_LIBRARY.male_qianhou.voice, speed };
    }

    return { voice: 'zh_female_qingxin', speed: 1.0 };
  };

  // 根据镜头内容推断情绪，进一步调整语速
  const adjustSpeedByEmotion = (dialogue: string, action: string, baseSpeed: number): number => {
    const text = `${dialogue} ${action}`.toLowerCase();
    let speed = baseSpeed;

    if (text.includes('!') || text.includes('！') || text.includes('大喊') || text.includes('尖叫')) {
      speed = Math.min(speed * 1.15, 1.3); // 感叹/大喊时语速快
    } else if (text.includes('?') || text.includes('？') || text.includes('疑惑') || text.includes('犹豫')) {
      speed = Math.max(speed * 0.95, 0.8); // 疑问/犹豫时语速稍慢
    } else if (text.includes('低声') || text.includes('耳语') || text.includes('悄悄')) {
      speed = Math.max(speed * 0.9, 0.75); // 低声/耳语时语速慢
    } else if (text.includes('急促') || text.includes('匆忙') || text.includes('紧急')) {
      speed = Math.min(speed * 1.1, 1.25); // 急促/紧急时语速快
    }

    return Math.round(speed * 100) / 100; // 保留两位小数
  };

  // 解析对话中的说话者角色名
  const parseSpeaker = (dialogue: string): string => {
    // 格式："角色名：对话内容" 或 "角色名: 对话内容"
    const match = dialogue.match(/^([^：:]{1,20})[：:]\s*/);
    if (match) {
      return match[1].trim();
    }
    return '';
  };

  const audioDir = projectStorage.getAudioDir(task.projectId);
  projectStorage.ensureDir(audioDir);

  let generated = 0;
  let failed = 0;

  for (const shot of targetShots) {
    try {
      // 解析说话者并分配音色（v2.0：基于角色性格+镜头情绪动态分配）
      const speaker = parseSpeaker(shot.dialogue);
      const { voice: baseVoice, speed: baseSpeed } = speaker ? getVoiceForCharacter(speaker) : { voice: 'zh_female_qingxin', speed: 1.0 };
      // 根据镜头情绪进一步调整语速
      const finalSpeed = adjustSpeedByEmotion(shot.dialogue, shot.action_description || '', baseSpeed);

      // 去除对话中的角色名前缀，只保留对话内容
      let dialogueText = shot.dialogue;
      if (speaker) {
        dialogueText = shot.dialogue.replace(/^[^：:]{1,20}[：:]\s*/, '').trim();
      }

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
