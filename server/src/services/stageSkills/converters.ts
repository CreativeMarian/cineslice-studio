// shuohao-skills 原生 JSON 模式转换器
// 把 MOO 数据库数据转成 skill 原生 JSON schema（storyboard/script/cast/art/outline）
// 供 vendor 里的 novel-*.mjs validate 脚本真实校验。
// 设计原则：如实映射 —— 能给的字段给 MOO 真实值，给不出的字段留空/占位，
// 校验结果如实暴露差距，不伪造"通过"。

import type { Database, NovelEpisode, ScriptCharacter, ScriptScene, ScriptProp, Shot } from '../../types';
import { NovelChapterDAO } from '../../models/novelChapter';
import { parseCharactersInShot } from '../../models/shot';

// ═══ 编号映射 ═══
export interface IdMaps {
  /** 角色名 → C 编号 */
  cast: Record<string, string>;
  /** 角色 UUID → C 编号 */
  castById: Record<string, string>;
  /** 场景 UUID → S 编号 */
  sceneById: Record<string, string>;
  /** 道具 UUID → P 编号 */
  propById: Record<string, string>;
}

export function buildIdMaps(
  characters: ScriptCharacter[],
  scenes: ScriptScene[],
  props: ScriptProp[]
): IdMaps {
  const cast: Record<string, string> = {};
  const castById: Record<string, string> = {};
  characters.forEach((c, i) => {
    const id = `C${String(i + 1).padStart(2, '0')}`;
    if (c.name) cast[c.name] = id;
    castById[c.id] = id;
  });
  const sceneById: Record<string, string> = {};
  scenes.forEach((s, i) => { sceneById[s.id] = `S${String(i + 1).padStart(2, '0')}`; });
  const propById: Record<string, string> = {};
  props.forEach((p, i) => { propById[p.id] = `P${String(i + 1).padStart(2, '0')}`; });
  return { cast, castById, sceneById, propById };
}

// ═══ 映射表（项目枚举 → skill/H3 官方枚举） ═══
const SIZE_MAP: Record<string, string> = {
  'extreme-wide': 'extreme-wide', 'extreme_wide': 'extreme-wide', '大远景': 'extreme-wide', 'extreme wide': 'extreme-wide',
  'wide': 'wide', 'full': 'wide', 'full_shot': 'wide', '全景': 'wide', '远景': 'wide',
  'medium': 'medium', '中景': 'medium', 'medium_shot': 'medium',
  'medium_closeup': 'close', 'medium-closeup': 'close', 'medium_close_up': 'close', '中近景': 'close',
  'closeup': 'close', 'close-up': 'close', 'close_up': 'close', 'close': 'close', '近景': 'close',
  'extreme-close': 'extreme-close', 'extreme_closeup': 'extreme-close', '大特写': 'extreme-close', '特写': 'extreme-close',
};

const CAM_MAP: Record<string, string> = {
  'static': 'Static Shot', 'fixed': 'Static Shot', '固定': 'Static Shot', '固定机位': 'Static Shot', '静止': 'Static Shot',
  'handheld': 'Tracking Shot', '手持跟拍': 'Tracking Shot', '跟拍': 'Tracking Shot', 'tracking': 'Tracking Shot', 'tracking_shot': 'Tracking Shot',
  '手持': 'Shake Slightly', 'shake': 'Shake Slightly/Strongly', '手持晃动': 'Shake Slightly/Strongly',
  'push_in': 'Push In', '推近': 'Push In', '推': 'Push In', 'push': 'Push In',
  'pull_out': 'Pull Out', '拉远': 'Pull Out', '拉': 'Pull Out', 'pull': 'Pull Out',
  'zoom_in': 'Zoom In/Out', 'zoom_out': 'Zoom In/Out', 'zoom': 'Zoom In/Out', '变焦': 'Zoom In/Out',
  'pan_left': 'Pan Left/Right', 'pan_right': 'Pan Left/Right', 'pan': 'Pan Left/Right', '摇': 'Pan Left/Right', '横摇': 'Pan Left/Right',
  'truck_left': 'Truck Left/Right', 'truck_right': 'Truck Left/Right', '横移': 'Truck Left/Right', '移': 'Truck Left/Right',
  'tilt_up': 'Tilt Up/Down', 'tilt_down': 'Tilt Up/Down', '俯仰': 'Tilt Up/Down',
  'arc': 'Arc Shot', '环绕': 'Arc Shot', '环拍': 'Arc Shot',
  'pov': 'POV', '主观': 'POV', '主观视角': 'POV',
  'roll': 'Roll Clockwise/Counterclockwise', '旋转': 'Roll Clockwise/Counterclockwise',
};

export function mapShotSize(size: string | null | undefined): string {
  const key = String(size || '').trim().toLowerCase();
  return SIZE_MAP[key] || 'medium';
}

export function mapCameraMovement(cam: string | null | undefined): string {
  const key = String(cam || '').trim().toLowerCase();
  return CAM_MAP[key] || 'Static Shot';
}

// ═══ 对白解析 ═══
/** '刘桂芬："台词"' 或 '刘桂芬：“台词”' → {speaker, line}；无名字 → VO */
export function parseDialogue(dialogue: string | null | undefined): { speaker: string; line: string } | null {
  const text = String(dialogue || '').trim();
  if (!text) return null;
  const m = text.match(/^([^:：]{1,20})[:：][“"『「]([\s\S]*?)[”"』」]\s*$/);
  if (m) return { speaker: m[1].trim(), line: m[2].trim() };
  // 无引号包裹：整体当台词
  return { speaker: 'VO', line: text };
}

/** 提取 video_prompt 里的 <d>[Chinese] 歌词块 */
export function extractLyricsBlock(videoPrompt: string | null | undefined): string | null {
  const text = String(videoPrompt || '');
  const m = text.match(/<d>\s*\[Chinese\]\s*([\s\S]*?)<\/d>/i);
  return m ? m[1].trim() : null;
}

/**
 * 镜头按场景分组（统一逻辑，script.json 与 storyboard.json 共用，保证对账一致）：
 * - key = S 编号（scene_id 能映射则用映射，否则归 S01）
 * - 按 S 编号升序返回
 */
export function groupShotsByScene(shots: Shot[], maps: IdMaps): Array<{ sceneId: string; shots: Shot[] }> {
  const byScene = new Map<string, Shot[]>();
  for (const sh of shots) {
    const key = sh.scene_id && maps.sceneById[sh.scene_id] ? maps.sceneById[sh.scene_id] : 'S01';
    if (!byScene.has(key)) byScene.set(key, []);
    byScene.get(key)!.push(sh);
  }
  const keys = Array.from(byScene.keys()).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return keys.map(k => ({ sceneId: k, shots: byScene.get(k)! }));
}

// ═══ script.json ═══
export function buildScriptJson(
  _db: Database,
  episode: NovelEpisode,
  shots: Shot[],
  maps: IdMaps
): { doc: any; beatRanges: Map<string, [number, number]> } {
  const epNum = episode.episode_number || 1;
  const targetSeconds = shots.reduce((s, x) => s + (x.duration_seconds || 5), 0) || 180;

  const beatRanges = new Map<string, [number, number]>();
  const scenes: any[] = [];

  // 场景顺序统一按 S 编号升序（与 storyboard 的 sceneIndex 一致，避免对账错位）
  for (const { sceneId, shots: groupShots } of groupShotsByScene(shots, maps)) {
    const flow: any[] = [];
    // 本场出场角色：聚合组内所有镜头的 characters_in_shot（不只台词角色）
    const sceneChars = new Set<string>();
    for (const sh of groupShots) {
      for (const n of parseCharactersInShot(sh.characters_in_shot)) {
        const cid = maps.cast[n] || n;
        if (cid && !cid.startsWith('C')) continue;
        sceneChars.add(cid);
      }
    }
    // skill 的拍是场级、1-based：每场 flow 独立计数
    let beatInScene = 0;
    for (const sh of groupShots) {
      const start = beatInScene;
      // 动作节拍（一拍一件事）
      const action = String(sh.action_description || '').trim();
      if (action && !/[""'“”『』「」]/.test(action)) {
        flow.push({ action });
        beatInScene++;
      } else if (action) {
        // 动作描述里混了引号台词：仍按动作节拍放，校验会提示
        flow.push({ action });
        beatInScene++;
      }
      // 台词节拍
      const dlg = parseDialogue(sh.dialogue);
      if (dlg) {
        const spk = maps.cast[dlg.speaker] || (dlg.speaker === 'VO' ? 'VO' : maps.cast[Object.keys(maps.cast).find(n => dlg.speaker.includes(n)) || ''] || 'C01');
        flow.push({ speaker: spk, line: dlg.line, delivery: '' });
        beatInScene++;
        if (spk !== 'VO') sceneChars.add(spk);
      }
      // 无对白但有歌词块：歌词行进 flow（speaker=VO 合唱/心声）
      if (!dlg) {
        const lyrics = extractLyricsBlock(sh.video_prompt);
        if (lyrics) {
          const lines = lyrics.split('\n').map(l => l.trim()).filter(Boolean);
          for (const line of lines) {
            flow.push({ speaker: 'VO', line, delivery: '唱歌，旋律随歌而行' });
            beatInScene++;
          }
        }
      }
      const end = beatInScene - 1;
      // skill 节拍 1-based：拍区间存 [start+1, end+1]
      if (end >= start) beatRanges.set(sh.id, [start + 1, end + 1]);
    }
    scenes.push({
      sceneId,
      lighting: undefined,
      characters: Array.from(sceneChars),
      props: [],
      flow,
    });
  }

  const hook = shots[0]?.action_description || shots[0]?.dialogue || '';
  const cliff = shots[shots.length - 1]?.action_description || '';
  const doc = {
    source: episode.title || '未命名剧集',
    params: { charsPerSecond: 4.5, actionSeconds: 2.5, tolerance: 0.15, maxLineChars: 35 },
    episodes: [{
      ep: epNum,
      targetSeconds,
      hook: hook.slice(0, 120) || '开场冷起（无剧本钩子说明）',
      cliff: cliff.slice(0, 120) || '结尾留悬（无剧本悬念说明）',
      beatsClaimed: [],
      hookBeat: [1, 1],
      scenes,
    }],
  };
  return { doc, beatRanges };
}

// ═══ cast.json ═══
const IMPORTANCE_MAP: Record<string, string> = {
  '主角': 'protagonist', 'protagonist': 'protagonist', 'lead': 'protagonist', '男主': 'protagonist', '女主': 'protagonist',
  '重要配角': 'supporting', 'supporting': 'supporting', 'support': 'supporting', '配角': 'supporting',
  'minor': 'minor', 'functional': 'minor', '功能': 'minor', '功能性角色': 'minor', 'other': 'minor',
};

export function buildCastJson(episode: NovelEpisode, characters: ScriptCharacter[]): any {
  const source = episode.title || '未命名剧集';
  const summary = characters
    .slice(0, 5)
    .map(c => `${c.name || '未命名'}：${(c.description || c.visual_description || '').slice(0, 40)}`)
    .join('；') || '角色暂未提取，本集无角色卡。';
  return {
    source,
    lang: 'zh',
    style: 'realistic',
    summary,
    characters: characters.map((c) => {
      const appearance = c.visual_description || c.description || '';
      return {
        name: c.name || '未命名',
        aliases: [],
        importance: IMPORTANCE_MAP[String(c.role_type || '').toLowerCase()] || 'minor',
        oneLiner: (c.description || appearance).slice(0, 60),
        persona: {
          gender: c.gender || '未知',
          ageRange: '未标注（推断）',
          identity: c.role_type || '角色',
          appearance,
          personality: [],
          temperament: '',
          motivation: '',
          arc: '',
          relationships: [],
          evidence: [],
        },
        image: {
          style: 'realistic',
          prompt: appearance || 'Character design sheet of a Chinese figure, semi-realistic painterly style.',
          promptLocal: appearance || '',
          // realistic 画风不得禁 photorealistic／3d render（skill 硬规则）
          negativePrompt: 'plastic skin, over-smooth skin, perfectly symmetric face, dead eyes, flat cloth, extra limbs, distorted proportions',
          tags: ['semi-realistic', 'character sheet'],
          sheet: '',
        },
        voice: {
          timbre: c.voice_profile ? String(c.voice_profile).slice(0, 60) : '',
          pitch: '',
          pace: '',
          accent: '',
          emotion: '',
          referenceHint: '',
          prompt: '',
        },
      };
    }),
  };
}

// ═══ art.json ═══
export function buildArtJson(episode: NovelEpisode, scenes: ScriptScene[], props: ScriptProp[]): any {
  return {
    source: episode.title || '未命名剧集',
    style: 'realistic',
    scenes: scenes.map((s) => {
      const desc = s.description || s.location || s.name || '';
      return {
        id: '', // 由调用方用 maps.sceneById 填入
        name: s.name || '未命名场景',
        primary: true,
        summary: desc,
        anchors: s.name ? [{ name: s.name, desc: desc.slice(0, 60) }] : [],
        lighting: [{ state: s.time_of_day || '日景', prompt: '' }],
        image: {
          prompt: `${desc} empty scene, no people`.slice(0, 400),
          negativePrompt: 'people, human figures, characters, crowds, silhouettes of people, text, watermark, signature',
          sheet: '',
          tags: ['semi-realistic', 'environment'],
        },
        variantOf: undefined,
        changes: undefined,
        usage: { episodes: [episode.episode_number || 1], beats: [] },
      };
    }),
    props: props.map((p) => ({
      id: '', // 调用方填
      name: p.name || '未命名道具',
      scale: '手持级',
      summary: p.description || '',
      anchors: [],
      states: [],
      relatedScenes: [],
      carriedBy: [],
      image: {
        prompt: `${p.description || p.name} isolated on white background, no hands, no people`.slice(0, 300),
        negativePrompt: 'people, hands, text, watermark, background',
        sheet: '',
        tags: ['prop sheet', 'white background'],
      },
      usage: { episodes: [episode.episode_number || 1], beats: [] },
    })),
  };
}

// ═══ storyboard.json（按场景聚合，切 ≤15s 生成段；段内多 cuts） ═══
export function buildStoryboardJson(
  episode: NovelEpisode,
  shots: Shot[],
  maps: IdMaps,
  beatRanges: Map<string, [number, number]>
): any {
  const epNum = episode.episode_number || 1;
  // 提示词语言：以实际分镜提示词为准（video_prompt 优先，回退动作描述）
  const promptSource = (shots[0]?.video_prompt || shots[0]?.action_description || '');
  const hasCJK = /[\u4e00-\u9fa5]/.test(promptSource);
  const promptLang = hasCJK ? 'zh' : 'en';

  const cutFor = (sh: Shot, beatFallback: number): any => {
    const charsRaw = parseCharactersInShot(sh.characters_in_shot);
    const chars = charsRaw.map(n => maps.cast[n] || n).filter(Boolean);
    const propsRaw = parseCharactersInShot(sh.props_in_shot);
    const props = propsRaw.map(n => n).filter(Boolean);
    const range = beatRanges.get(sh.id);
    const frame = sh.first_frame_description || sh.action_description || sh.video_prompt || '';
    return {
      beats: range ? [range[0], range[1]] : [beatFallback, beatFallback],
      seconds: sh.duration_seconds || 5,
      size: mapShotSize(sh.shot_size),
      camera: mapCameraMovement(sh.camera_movement),
      characters: chars,
      props,
      frame,
      note: '',
    };
  };

  // 场景聚合（与 script.json 同一分组逻辑）：同一场景的所有镜头聚为一个组，
  // sceneIndex 用剧本 S 编号，保证单调不倒退
  const sceneGroups = groupShotsByScene(shots, maps);

  const segments: any[] = [];
  let segNo = 0;
  let globalBeat = 0;
  // sceneIndex 必须从 1 连续编号，且与 script.json 的 scenes 数组顺序一致
  // （skill 用它认领"第几场"；S 编号若跳号（如无 S01）会让对账错位）
  for (let si = 0; si < sceneGroups.length; si++) {
    const sceneIdx = si + 1;
    const groupShots = sceneGroups[si].shots;
    // 切 ≤15s 段（H3 单次生成上限）
    let chunk: Shot[] = [];
    let acc = 0;
    const flush = () => {
      if (chunk.length === 0) return;
      segNo++;
      const cuts = chunk.map((sh, ci) => cutFor(sh, globalBeat + ci + 1));
      segments.push({
        id: `E${String(epNum).padStart(2, '0')}-${String(segNo).padStart(2, '0')}`,
        sceneIndex: sceneIdx,
        cuts,
        h3Prompt: chunk.map(sh => sh.video_prompt || '').filter(Boolean).join('\n\n') || chunk[0]?.action_description || '',
        note: '',
      });
      globalBeat += chunk.length;
      chunk = [];
      acc = 0;
    };
    for (const sh of groupShots) {
      const d = sh.duration_seconds || 5;
      if (acc > 0 && acc + d > 15) flush();
      chunk.push(sh);
      acc += d;
    }
    flush();
  }

  return {
    source: episode.title || '未命名剧集',
    style: 'realistic',
    promptLang,
    episodes: [{ ep: epNum, segments }],
  };
}

// ═══ book.txt（novel-characters validate 需要原文） ═══
export function buildBookTxt(db: Database, projectId: string): string {
  const chapters = NovelChapterDAO.listByProject(db, projectId);
  if (!chapters || chapters.length === 0) return '';
  return chapters
    .map(c => `${c.title || ''}\n${c.content || ''}`)
    .join('\n\n');
}
