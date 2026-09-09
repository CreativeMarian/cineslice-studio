// 自动流水线共享工具：模型选择、风格预设、剧本分析、导演镜头上下文
import type { Database } from '../../types';
import {
  ModelRegistryDAO,
  ProjectDAO,
  StylePresetDAO,
  ScriptCharacterDAO,
  ScriptSceneDAO,
  parseCharactersInShot,
} from '../../models';
import { scriptAnalysisService, type ScriptAnalysisResult } from '../scriptAnalysisService';
import type { DirectorShotContext, CharacterDetail } from '../directorPromptService';
import { scriptAnalysisCache , cacheScriptAnalysis } from './state';

/**
 * 真实数据完成度检测：该阶段是否已有实际产出（幂等跳过用）
 * 与 GET /pipeline/progress 同口径——用户手动完成的操作也能正确识别
 */
export function isStageComplete(db: Database, projectId: string, stage: string): boolean {
  const count = (sql: string, ...args: any[]) => {
    const row: any = db.prepare(sql).get(...args);
    return Number(row?.c || 0);
  };
  switch (stage) {
    case 'novel':
      return count('SELECT COUNT(*) c FROM novel_chapters WHERE project_id = ?', projectId) > 0;
    case 'episodes':
      return count('SELECT COUNT(*) c FROM novel_episodes WHERE project_id = ?', projectId) > 0;
    case 'script':
      return count('SELECT COUNT(*) c FROM novel_episodes WHERE project_id = ? AND LENGTH(TRIM(script_content)) > 0', projectId) > 0;
    case 'characters': {
      const ids = db.prepare('SELECT id FROM novel_episodes WHERE project_id = ?').all(projectId) as Array<{ id: string }>;
      if (ids.length === 0) return false;
      const ph = ids.map(() => '?').join(',');
      return count(`SELECT COUNT(*) c FROM script_characters WHERE episode_id IN (${ph})`, ...ids.map(r => r.id)) > 0;
    }
    case 'scenes': {
      const ids = db.prepare('SELECT id FROM novel_episodes WHERE project_id = ?').all(projectId) as Array<{ id: string }>;
      if (ids.length === 0) return false;
      const ph = ids.map(() => '?').join(',');
      return count(`SELECT COUNT(*) c FROM script_scenes WHERE episode_id IN (${ph})`, ...ids.map(r => r.id)) > 0;
    }
    case 'shots': {
      const ids = db.prepare('SELECT id FROM novel_episodes WHERE project_id = ?').all(projectId) as Array<{ id: string }>;
      if (ids.length === 0) return false;
      const ph = ids.map(() => '?').join(',');
      return count(`SELECT COUNT(*) c FROM shots WHERE episode_id IN (${ph})`, ...ids.map(r => r.id)) > 0;
    }
    case 'keyframes': {
      // flf2v 首尾帧链路需要每镜 first+last 双帧：只生成 first 的镜头视为未完成（自动补齐 last）
      // 防止"有一帧就跳阶段"导致 last 帧永不生成、视频尾帧退化
      const totalShots = count('SELECT COUNT(*) c FROM shots s JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ?', projectId);
      if (totalShots === 0) return false;
      const shotsWithFirst = count("SELECT COUNT(DISTINCT k.shot_id) c FROM shot_keyframes k JOIN shots s ON k.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND k.frame_type = 'first' AND k.image_url IS NOT NULL AND k.image_url != ?", projectId, '');
      const shotsWithLast = count("SELECT COUNT(DISTINCT k.shot_id) c FROM shot_keyframes k JOIN shots s ON k.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND k.frame_type = 'last' AND k.image_url IS NOT NULL AND k.image_url != ?", projectId, '');
      return shotsWithFirst >= totalShots && shotsWithLast >= totalShots;
    }
    case 'audio': {
      // v3.0: 结构化配音记录（shot_audio）判定，与 progress 完成度一致
      const total = count(
        "SELECT COUNT(*) c FROM shots s JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND LENGTH(TRIM(COALESCE(s.dialogue,''))) > 0",
        projectId
      );
      if (total === 0) return false;
      const done = count(
        "SELECT COUNT(DISTINCT a.shot_id) c FROM shot_audio a JOIN shots s ON a.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND a.status = 'completed'",
        projectId
      );
      return done >= total;
    }
    case 'export': {
      // v3.0: 每集都有成功的拼接记录（render_logs episode_compose）才算完成
      const epCount = count('SELECT COUNT(*) c FROM novel_episodes WHERE project_id = ?', projectId);
      if (epCount === 0) return false;
      const done = count(
        "SELECT COUNT(*) c FROM render_logs r JOIN novel_episodes e ON r.episode_id = e.id WHERE e.project_id = ? AND r.action = 'episode_compose' AND r.details LIKE '%\"status\":\"completed\"%'",
        projectId
      );
      return done >= epCount;
    }
    case 'video': {
      // 全部镜头都有完成视频才算完成（缺失镜头由 stageVideo 逐镜补齐，不重跑已有）
      const totalShots = count('SELECT COUNT(*) c FROM shots s JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ?', projectId);
      if (totalShots === 0) return false;
      const shotsWithVideo = count("SELECT COUNT(DISTINCT v.shot_id) c FROM shot_video_intervals v JOIN shots s ON v.shot_id = s.id JOIN novel_episodes e ON s.episode_id = e.id WHERE e.project_id = ? AND v.status = 'completed' AND v.video_url IS NOT NULL AND v.video_url != ''", projectId);
      return shotsWithVideo >= totalShots;
    }
    default:
      return false;
  }
}

/**
 * 获取第一个已配置的指定类型模型
 * 视频类型：优先本地 ComfyUI flf2v（MiniMax H3 首尾帧）——首尾帧硬锁定、免费无额度、质量最稳；
 *           未配置 flf2v 时回退到用户配置的第一个视频模型
 */
export function getFirstModel(db: Database, userId: string, modelType: string): { provider: string; modelName: string } | null {
  const models = ModelRegistryDAO.listByUserAndType(db, userId, modelType);
  if (models.length === 0) return null;
  if (modelType === 'video') {
    const flf = models.find(m => m.provider === 'comfyui' && String(m.model_name).toLowerCase().includes('flf2v'));
    if (flf) return { provider: flf.provider, modelName: flf.model_name };
  }
  return { provider: models[0].provider, modelName: models[0].model_name };
}

/**
 * 获取项目的风格预设
 * 返回 visual_style, camera_language, color_palette, shot_rhythm
 * 如果项目没有设置风格预设，返回默认风格
 */
export function getProjectStylePreset(db: Database, projectId: string): {
  visualStyle: string;
  cameraLanguage: string;
  colorPalette: string;
  rhythm: string;
  presetName: string;
} {
  const defaultStyle = {
    visualStyle: '电影级写实风格，cinematic lighting，高细节，8k分辨率，统一色调',
    cameraLanguage: 'professional cinematography，多样化景别，推拉摇移',
    colorPalette: 'cinematic color grading，自然肤色，冷暖对比',
    rhythm: '节奏紧凑，动作场景快速剪辑，情感场景慢速长镜头',
    presetName: '默认电影写实风',
  };

  try {
    const project = ProjectDAO.getById(db, projectId);
    if (!project?.style_preset_id) return defaultStyle;

    const preset = StylePresetDAO.getById(db, project.style_preset_id);
    if (!preset) return defaultStyle;

    return {
      visualStyle: preset.visual_style || defaultStyle.visualStyle,
      cameraLanguage: preset.camera_language || defaultStyle.cameraLanguage,
      colorPalette: preset.color_palette || defaultStyle.colorPalette,
      rhythm: preset.shot_rhythm || defaultStyle.rhythm,
      presetName: preset.name,
    };
  } catch (err) {
    console.error('[AutoPipeline] 获取风格预设失败:', (err as Error).message);
    return defaultStyle;
  }
}

/**
 * 获取或创建剧本分析结果
 * 在分镜/关键帧/视频生成之前调用，分析剧情、场景、角色、情绪、节奏
 */
export async function getOrCreateScriptAnalysis(
  db: Database,
  projectId: string,
  userId: string,
  episodeId: string
): Promise<ScriptAnalysisResult | null> {
  // 检查缓存（按剧集缓存，支持多剧集项目）
  const cached = scriptAnalysisCache.get(episodeId);
  if (cached) {
    console.log('[AutoPipeline] 使用缓存的剧本分析结果');
    return cached;
  }

  try {
    console.log('[AutoPipeline] 开始剧本分析...');
    const analysis = await scriptAnalysisService.analyzeScript(db, episodeId, userId);
    cacheScriptAnalysis(episodeId, analysis);
    console.log(`[AutoPipeline] 剧本分析完成: ${scriptAnalysisService.getAnalysisSummary(analysis)}`);
    return analysis;
  } catch (err) {
    console.error('[AutoPipeline] 剧本分析失败（跳过，使用原始提示词）:', (err as Error).message);
    return null;
  }
}

/**
 * 构建导演级镜头上下文（用于深度提示词生成）
 * 包含：前后镜头衔接、角色详细信息、场景环境、天气时段等
 */
export function buildDirectorShotContext(
  db: Database,
  shot: any,
  allShots: any[],
  episodeId: string,
  totalShots: number
): DirectorShotContext {
  // 获取当前镜头的索引
  const shotIndex = allShots.findIndex(s => s.id === shot.id);

  // 获取前后镜头的动作描述
  const previousShot = shotIndex > 0 ? allShots[shotIndex - 1] : null;
  const nextShot = shotIndex < allShots.length - 1 ? allShots[shotIndex + 1] : null;

  // 获取角色信息
  let charactersInShot: string[] = [];
  const characterDetails: Record<string, CharacterDetail> = {};
  try {
    // 使用统一的解析函数（支持数组/JSON字符串/逗号分隔三种格式）
    charactersInShot = parseCharactersInShot(shot.characters_in_shot);

    // 从 ScriptCharacterDAO 获取角色详细信息
    if (charactersInShot.length > 0) {
      const allChars = ScriptCharacterDAO.listByEpisode(db, episodeId);
      allChars.forEach(char => {
        if (charactersInShot.includes(char.name)) {
          characterDetails[char.name] = {
            name: char.name,
            age: char.age || undefined,
            gender: char.gender || undefined,
            appearance: char.appearance || char.description || undefined,
            personality: char.personality || undefined,
            currentEmotion: undefined,
            physicalState: undefined,
            propsHolding: undefined,
          };
        }
      });
    }
  } catch (err) {
    console.error('[AutoPipeline] 获取角色信息失败:', (err as Error).message);
  }

  // 获取场景信息
  let sceneName: string | undefined;
  let sceneDescription: string | undefined;
  let timeOfDay: string | undefined;
  let weather: string | undefined;
  try {
    if (shot.scene_id) {
      const scene = ScriptSceneDAO.getById(db, shot.scene_id);
      if (scene) {
        sceneName = scene.name;
        sceneDescription = scene.description || scene.location;
        timeOfDay = scene.time_of_day;
        weather = scene.weather;
      }
    }
  } catch (err) {
    console.error('[AutoPipeline] 获取场景信息失败:', (err as Error).message);
  }

  // 推断情绪
  const mood = inferMoodFromShot(shot);

  return {
    shotNumber: shot.shot_number || 0,
    totalShots: totalShots,
    actionDescription: shot.action_description || '',
    dialogue: shot.dialogue || '',
    shotSize: shot.shot_size || 'medium',
    cameraMovement: shot.camera_movement || 'static',
    duration: shot.duration_seconds || 5,
    charactersInShot,
    sceneName,
    sceneDescription,
    timeOfDay,
    weather,
    mood,
    previousShotAction: previousShot?.action_description,
    nextShotAction: nextShot?.action_description,
    previousShotCharacters: previousShot?.characters_in_shot
      ? (Array.isArray(previousShot.characters_in_shot)
          ? previousShot.characters_in_shot
          : parseCharactersInShot(previousShot.characters_in_shot))
      : undefined,
    characterDetails: Object.keys(characterDetails).length > 0 ? characterDetails : undefined,
  };
}

/**
 * 从镜头信息推断情绪
 */
export function inferMoodFromShot(shot: any): string {
  const text = `${shot.action_description || ''} ${shot.dialogue || ''} ${shot.emotion || ''}`.toLowerCase();

  if (text.includes('紧张') || text.includes('焦虑') || text.includes('不安') || text.includes('害怕')) return '紧张';
  if (text.includes('愤怒') || text.includes('生气') || text.includes('怒')) return '愤怒';
  if (text.includes('悲伤') || text.includes('难过') || text.includes('哭') || text.includes('泪')) return '悲伤';
  if (text.includes('惊讶') || text.includes('吃惊') || text.includes('震惊')) return '惊讶';
  if (text.includes('恐惧') || text.includes('惊恐') || text.includes('怕')) return '恐惧';
  if (text.includes('思考') || text.includes('想') || text.includes('考虑')) return '思考';

  return '平静';
}
