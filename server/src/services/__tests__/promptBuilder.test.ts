// promptBuilder 单元测试（P3-16）
// 覆盖：buildIdentityLockBlock / buildSeriesProhibitionBlock / buildFullVideoPrompt / buildWardrobeBlock
// 运行：npx vitest run server/src/services/__tests__/promptBuilder.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildIdentityLockBlock,
  buildSeriesProhibitionBlock,
  buildFullVideoPrompt,
  buildWardrobeBlock,
  SERIES_PROHIBITION_LINE,
} from '../promptBuilder';
import { VIDEO_PROMPT_MAX_LENGTH } from '../../constants';
import type { ScriptCharacter, Shot, ScriptScene, Project } from '../../types';

// ─── 测试数据工厂（仅填充被测函数实际读取的字段） ───

function makeCharacter(overrides: Partial<ScriptCharacter>): ScriptCharacter {
  return {
    id: 'c1',
    user_id: 'u1',
    episode_id: 'e1',
    name: '林晚',
    gender: 'female',
    role_type: 'protagonist',
    description: '',
    visual_description: '',
    reference_image_url: null,
    concept_images: null,
    four_view_images: null,
    selected_image_index: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: 's1',
    user_id: 'u1',
    episode_id: 'e1',
    scene_id: null,
    shot_number: 1,
    shot_size: 'medium',
    action_description: '她转身望向窗外',
    dialogue: '',
    camera_movement: 'static',
    grid_position: '5',
    duration_seconds: 5,
    characters_in_shot: null,
    props_in_shot: null,
    notes: null,
    subject: null,
    lighting: null,
    mood: null,
    transition: null,
    pace: null,
    character_outfits: null,
    phase: null,
    phase_name: null,
    use_next_first_frame: 0,
    first_frame_description: null,
    last_frame_description: null,
    video_prompt: null,
    video_skill: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const scene: ScriptScene = {
  id: 'scn1',
  user_id: 'u1',
  episode_id: 'e1',
  name: '顶楼办公室',
  location: '城市CBD高层',
  time_of_day: 'day',
  atmosphere: '紧张压抑',
  description: '落地窗外是黄昏的城市天际线',
  concept_images: null,
  selected_image_index: 0,
  created_at: '',
  updated_at: '',
};

const project: Project = {
  id: 'p1',
  user_id: 'u1',
  title: '雾港迷局',
  style_description: '冷色调都市悬疑，电影感光影',
} as Project;

// ─── buildIdentityLockBlock ───

describe('buildIdentityLockBlock', () => {
  it('identity_lock 存在时输出包含【身份锁定】与角色名及标志特征', () => {
    const char = makeCharacter({
      identity_lock: JSON.stringify({
        age: '25岁',
        face_shape: '鹅蛋脸',
        hairstyle: '黑色长发',
        hair_color: '黑色',
        body_type: '中等身材偏瘦',
        distinctive_features: '左眼下方泪痣',
        prohibitions: '不戴眼镜',
      }),
    });
    const out = buildIdentityLockBlock(char);
    expect(out).toContain('【身份锁定】');
    expect(out).toContain('林晚');
    expect(out).toContain('泪痣');
  });

  it('identity_lock 为空时回退到 visual_prompt', () => {
    const char = makeCharacter({ visual_prompt: '黑色长发，冷白皮，红色风衣' });
    const out = buildIdentityLockBlock(char);
    expect(out).toContain('【身份锁定】林晚：黑色长发，冷白皮，红色风衣');
  });

  it('identity_lock 与 visual_prompt 均空时回退到 visual_description', () => {
    const char = makeCharacter({ visual_description: '高挑身影，目光锋利' });
    const out = buildIdentityLockBlock(char);
    expect(out).toContain('高挑身影，目光锋利');
  });

  it('角色名缺失时返回空串', () => {
    const char = makeCharacter({ name: '' });
    expect(buildIdentityLockBlock(char)).toBe('');
  });

  it('compact=true 只保留核心特征（age/face_shape/hairstyle/distinctive_features），省略发色/体型/禁忌', () => {
    const char = makeCharacter({
      identity_lock: JSON.stringify({
        age: '25岁',
        face_shape: '鹅蛋脸',
        hairstyle: '黑色长发',
        hair_color: '黑色',
        body_type: '中等身材偏瘦',
        distinctive_features: '左眼下方泪痣',
        prohibitions: '不戴眼镜',
      }),
    });
    const compact = buildIdentityLockBlock(char, true);
    expect(compact).toContain('【身份锁定】林晚：25岁，鹅蛋脸，黑色长发，左眼下方泪痣');
    expect(compact).not.toContain('，黑色，'); // 发色单独段已省略（发型段中的"黑色长发"保留）
    expect(compact).not.toContain('中等身材偏瘦');
    expect(compact).not.toContain('禁忌');
  });

  it('compact=true 与 compact=false 内容不同（compact 更短）', () => {
    const char = makeCharacter({
      identity_lock: JSON.stringify({
        age: '25岁',
        face_shape: '鹅蛋脸',
        hairstyle: '黑色长发',
        hair_color: '黑色',
        body_type: '中等身材偏瘦',
        distinctive_features: '左眼下方泪痣',
        prohibitions: '不戴眼镜',
      }),
    });
    const compact = buildIdentityLockBlock(char, true);
    const full = buildIdentityLockBlock(char, false);
    expect(compact.length).toBeLessThan(full.length);
    expect(full).toContain('标志特征：左眼下方泪痣');
    expect(full).toContain('禁忌：不戴眼镜');
  });
});

// ─── buildSeriesProhibitionBlock ───

describe('buildSeriesProhibitionBlock', () => {
  it('输出固定不变（与 SERIES_PROHIBITION_LINE 一致）', () => {
    expect(buildSeriesProhibitionBlock()).toBe(SERIES_PROHIBITION_LINE);
  });

  it('连续调用两次结果完全一致', () => {
    expect(buildSeriesProhibitionBlock()).toBe(buildSeriesProhibitionBlock());
  });
});

// ─── buildFullVideoPrompt ───

describe('buildFullVideoPrompt', () => {
  const chars = [
    makeCharacter({
      identity_lock: JSON.stringify({
        age: '25岁', face_shape: '鹅蛋脸', hairstyle: '黑色长发', hair_color: '黑色',
        body_type: '中等身材偏瘦', distinctive_features: '左眼下方泪痣', prohibitions: '不戴眼镜',
      }),
    }),
  ];

  it('禁令行始终位于输出末尾', () => {
    const prompt = buildFullVideoPrompt(makeShot({}), chars, scene, project);
    expect(prompt.endsWith(SERIES_PROHIBITION_LINE)).toBe(true);
  });

  it('超长动作描述时禁令行仍不被截断、总长不超过上限', () => {
    const longAction = '她快步穿过走廊' + '，脚步急促而慌乱'.repeat(200);
    const prompt = buildFullVideoPrompt(makeShot({ action_description: longAction }), chars, scene, project);
    expect(prompt.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_LENGTH);
    expect(prompt.endsWith(SERIES_PROHIBITION_LINE)).toBe(true);
  });

  it('常规输入总长度不超过上限', () => {
    const prompt = buildFullVideoPrompt(makeShot({}), chars, scene, project);
    expect(prompt.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_LENGTH);
    expect(prompt).toContain('【身份锁定】');
  });

  it('无角色/场景/项目时仍输出禁令行', () => {
    const prompt = buildFullVideoPrompt(makeShot({}), [], null, null);
    expect(prompt.endsWith(SERIES_PROHIBITION_LINE)).toBe(true);
  });
});

// ─── buildWardrobeBlock ───

describe('buildWardrobeBlock', () => {
  const wardrobe = JSON.stringify([
    { id: 'w1', name: '晚宴礼服', description: '深红长裙', color: '暗红', scene_id: 'scn1', is_default: 0 },
    { id: 'w2', name: '日常便装', description: '白衬衫加风衣', color: '米白', scene_id: null, is_default: 1 },
  ]);

  it('按 scene_id 精确匹配服装', () => {
    const char = makeCharacter({ wardrobe });
    const out = buildWardrobeBlock(char, 'scn1');
    expect(out).toContain('晚宴礼服');
  });

  it('无匹配 scene_id 时回退到默认服装（is_default=1）', () => {
    const char = makeCharacter({ wardrobe });
    const out = buildWardrobeBlock(char, 'scn_unknown');
    expect(out).toContain('日常便装');
  });

  it('无任何服装数据时返回空串', () => {
    const char = makeCharacter({ wardrobe: null });
    expect(buildWardrobeBlock(char, 'scn1')).toBe('');
  });

  it('无匹配且无默认服装时回退到第一套', () => {
    const wardrobeNoDefault = JSON.stringify([
      { id: 'w1', name: '晚宴礼服', description: '深红长裙', color: '暗红', scene_id: null, is_default: 0 },
    ]);
    const char = makeCharacter({ wardrobe: wardrobeNoDefault });
    const out = buildWardrobeBlock(char, 'scn_unknown');
    expect(out).toContain('晚宴礼服');
  });
});
