// 音色分配共享模块
// v1.0 - 手动路径（routes/audio.ts）与自动流水线（autoPipeline/stages/audio.ts）共用的
// 角色音色解析：voice_profile（用户固定音色档案）优先 → 动态按性别/角色类型/性格/年龄分配
import type { Database } from '../types';
import { ScriptCharacterDAO } from '../models';

// 音色库（豆包 TTS 支持的 8 种音色，与前端角色音色选择 UI 对齐）
export const VOICE_LIBRARY: Record<string, { voice: string; desc: string }> = {
  female_qingxin: { voice: 'zh_female_qingxin', desc: '清新女声，适合年轻女主角' },
  female_wener: { voice: 'zh_female_wener', desc: '温柔女声，适合温柔/成熟女性' },
  female_tianmei: { voice: 'zh_female_tianmei', desc: '甜美女声，适合可爱/少女角色' },
  female_shenhou: { voice: 'zh_female_shenhou', desc: '深厚女声，适合成熟/威严女性' },
  male_qianhou: { voice: 'zh_male_qianhou', desc: '浑厚男声，适合成熟男主角' },
  male_xiaoshen: { voice: 'zh_male_xiaoshen', desc: '小生男声，适合年轻/阴险角色' },
  male_yangguang: { voice: 'zh_male_yangguang', desc: '阳光男声，适合开朗/正义角色' },
  male_chenwen: { voice: 'zh_male_chenwen', desc: '沉稳男声，适合中年/权威角色' },
};

export interface VoiceAssignment {
  voice: string;
  speed: number;
}

/** 解析对话中的说话者角色名："角色名：对话内容" / "角色名: 对话内容" */
export function parseSpeaker(dialogue: string): string {
  const match = dialogue.match(/^([^：:]{1,20})[：:]\s*/);
  return match ? match[1].trim() : '';
}

/** 去掉对话中的角色名前缀，只保留台词正文（避免 TTS 把"林澈："也读出来） */
export function stripSpeakerPrefix(dialogue: string): string {
  const speaker = parseSpeaker(dialogue);
  return speaker ? dialogue.replace(/^[^：:]{1,20}[：:]\s*/, '').trim() : dialogue;
}

/** 根据角色信息选择音色：voice_profile 固定音色优先，否则按性别/角色类型/性格/年龄动态分配 */
export function resolveVoiceForCharacter(char: { voice_profile?: string | null; gender?: string; role_type?: string; personality?: string; age?: string } | null | undefined): VoiceAssignment {
  if (!char) return { voice: 'zh_female_qingxin', speed: 1.0 };

  // 角色音色档案优先（用户手动固定）：同一角色跨镜头/跨集声音始终一致
  if (char.voice_profile) {
    try {
      const profile = JSON.parse(char.voice_profile);
      if (profile && profile.voice) {
        return {
          voice: profile.voice,
          speed: typeof profile.speed === 'number' ? profile.speed : 1.0,
        };
      }
    } catch {
      // 音色档案解析失败，回退动态分配
    }
  }

  const gender = char.gender || 'other';
  const roleType = char.role_type || 'supporting';
  const personality = (char.personality || '').toLowerCase();
  const age = char.age || '';

  // 默认语速，按性格调整
  let speed = 1.0;
  if (personality.includes('紧张') || personality.includes('焦虑') || personality.includes('急')) {
    speed = 1.15;
  } else if (personality.includes('温柔') || personality.includes('平静') || personality.includes('沉稳')) {
    speed = 0.9;
  } else if (personality.includes('愤怒') || personality.includes('激动')) {
    speed = 1.2;
  } else if (personality.includes('悲伤') || personality.includes('难过')) {
    speed = 0.85;
  }

  // 女性角色
  if (gender === 'female') {
    if (roleType === 'protagonist') {
      if (personality.includes('温柔') || personality.includes('成熟')) {
        return { voice: VOICE_LIBRARY.female_wener.voice, speed };
      } else if (personality.includes('可爱') || personality.includes('少女') || age.includes('少女')) {
        return { voice: VOICE_LIBRARY.female_tianmei.voice, speed };
      }
      return { voice: VOICE_LIBRARY.female_qingxin.voice, speed };
    } else if (roleType === 'antagonist') {
      if (personality.includes('威严') || personality.includes('成熟')) {
        return { voice: VOICE_LIBRARY.female_shenhou.voice, speed };
      }
      return { voice: VOICE_LIBRARY.female_wener.voice, speed };
    }
    if (personality.includes('可爱') || personality.includes('少女')) {
      return { voice: VOICE_LIBRARY.female_tianmei.voice, speed };
    }
    return { voice: VOICE_LIBRARY.female_qingxin.voice, speed };
  }

  // 男性角色
  if (gender === 'male') {
    if (roleType === 'protagonist') {
      if (personality.includes('阳光') || personality.includes('开朗') || personality.includes('正义')) {
        return { voice: VOICE_LIBRARY.male_yangguang.voice, speed };
      } else if (personality.includes('沉稳') || personality.includes('成熟') || age.includes('中年')) {
        return { voice: VOICE_LIBRARY.male_chenwen.voice, speed };
      }
      return { voice: VOICE_LIBRARY.male_qianhou.voice, speed };
    } else if (roleType === 'antagonist') {
      if (personality.includes('阴险') || personality.includes('年轻') || age.includes('青年')) {
        return { voice: VOICE_LIBRARY.male_xiaoshen.voice, speed };
      }
      return { voice: VOICE_LIBRARY.male_chenwen.voice, speed };
    }
    if (personality.includes('阳光') || personality.includes('开朗')) {
      return { voice: VOICE_LIBRARY.male_yangguang.voice, speed };
    } else if (personality.includes('年轻') || age.includes('青年')) {
      return { voice: VOICE_LIBRARY.male_xiaoshen.voice, speed };
    }
    return { voice: VOICE_LIBRARY.male_qianhou.voice, speed };
  }

  return { voice: 'zh_female_qingxin', speed: 1.0 };
}

/**
 * 按镜头内容情绪调整语速（感叹/大喊加快，疑问/犹豫/低声放慢）
 */
export function adjustSpeedByEmotion(dialogue: string, action: string, baseSpeed: number): number {
  const text = `${dialogue} ${action}`.toLowerCase();
  let speed = baseSpeed;
  if (text.includes('!') || text.includes('！') || text.includes('大喊') || text.includes('尖叫')) {
    speed = Math.min(speed * 1.15, 1.3);
  } else if (text.includes('?') || text.includes('？') || text.includes('疑惑') || text.includes('犹豫')) {
    speed = Math.max(speed * 0.95, 0.8);
  } else if (text.includes('低声') || text.includes('耳语') || text.includes('悄悄')) {
    speed = Math.max(speed * 0.9, 0.75);
  } else if (text.includes('急促') || text.includes('匆忙') || text.includes('紧急')) {
    speed = Math.min(speed * 1.1, 1.25);
  }
  return Math.round(speed * 100) / 100;
}

/**
 * 为镜头解析说话者并分配音色（含剧集角色查询）
 */
export function resolveVoiceForShot(db: Database, episodeId: string, dialogue: string): VoiceAssignment {
  const speaker = parseSpeaker(dialogue);
  if (speaker) {
    const chars = ScriptCharacterDAO.listByEpisode(db, episodeId);
    const char = chars.find(c => c.name === speaker);
    return resolveVoiceForCharacter(char);
  }
  return { voice: 'zh_female_qingxin', speed: 1.0 };
}
