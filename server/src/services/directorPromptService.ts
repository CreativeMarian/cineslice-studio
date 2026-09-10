// 导演级提示词生成服务 v2.0
// 深度优化：时序控制、动作分解、表情细节、心理活动、环境交互、连贯性、真实性校验
// 适用于所有场景，生成电影级、符合实际、贴合实际的提示词

import type { ScriptAnalysisResult } from './scriptAnalysisService';

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

export interface DirectorShotContext {
  shotNumber: number;
  totalShots: number;
  actionDescription: string;
  dialogue: string;
  shotSize: string;
  cameraMovement: string;
  duration: number;
  charactersInShot: string[];
  sceneName?: string;
  sceneDescription?: string;
  timeOfDay?: string;
  weather?: string;
  mood?: string;
  // 前后镜头上下文
  previousShotAction?: string;
  nextShotAction?: string;
  /** 关键帧帧类型：first=动作起点画面，last=动作终点画面 */
  frameType?: 'first' | 'last';
  /** 帧专属画面描述（生成关键帧时优先于 actionDescription） */
  frameSpecificDescription?: string;
  previousShotCharacters?: string[];
  // 角色详细信息
  characterDetails?: Record<string, CharacterDetail>;
}

export interface CharacterDetail {
  name: string;
  age?: string;
  gender?: string;
  appearance?: string; // 外貌：发型、服装、体型
  personality?: string; // 性格
  currentEmotion?: string; // 当前情绪
  emotionalState?: string; // 情绪状态（紧张/平静/愤怒/悲伤）
  physicalState?: string; // 身体状态（疲惫/受伤/健康）
  propsHolding?: string; // 手持道具
}

export interface DirectorPromptResult {
  /** 完整的导演级提示词 */
  prompt: string;
  /** 负面提示词 */
  negativePrompt: string;
  /** 优化说明 */
  optimizations: string[];
  /** 时序分解 */
  timeline: TimelineSegment[];
}

export interface TimelineSegment {
  startTime: number;
  endTime: number;
  description: string;
  action: string;
  expression: string;
  camera: string;
}

// ═══════════════════════════════════════════════════════════════
// 通用负面提示词（增强版）
// ═══════════════════════════════════════════════════════════════

const DIRECTOR_NEGATIVE_PROMPTS = [
  // 画质问题
  '低质量，模糊，变形，噪点，压缩痕迹，色带，锯齿，画面撕裂，过曝，欠曝',
  // 人物问题
  '多余手指，多余肢体，手指融合，手部畸形，面部扭曲，五官错位，换脸，角色不匹配',
  '塑料皮肤，蜡像质感，恐怖谷，过度光滑，AI伪影，CG感，眼睛无神，瞳孔异常',
  // 动作问题（核心新增）
  '动作时序错误，动作逻辑错误，物体穿模，手部穿模，手指穿透物体',
  '打电话时点手机屏幕，拨号完成后还在点屏幕，手机位置错误，手机没有贴在耳边',
  '走路时手臂不摆动，奔跑时身体不前倾，站立时重心错误，坐姿不自然',
  '表情与动作不符，情绪与场景不符，说话时嘴部不动，不说话时嘴部乱动',
  // 场景问题
  '背景闪烁，背景变形，家具移动，光照不一致，阴影方向错误',
  '场景错误，物体位置错误，透视错误，雨天没有雨滴，室内有雨',
  // 物理问题
  '反重力，物体漂浮，液体逆流，无惯性运动，瞬间加速，碰撞无反应',
  '头发不自然飘动，衣物不自然摆动，雨水方向错误，水花不自然',
  // 连贯性问题（核心新增）
  '前后镜头角色位置不连贯，前后镜头服装不一致，前后镜头发型不一致',
  '前后镜头道具不一致，前后镜头环境不一致，前后镜头情绪突变',
  '角色突然出现，角色突然消失，物体突然出现，物体突然消失',
  // 镜头问题
  '错误镜头角度，糟糕构图，平光，无景深，动作场景固定镜头',
  '镜头抖动过度，镜头运动不自然，焦距突变，画面突然切换',
];

// ═══════════════════════════════════════════════════════════════
// 动作库：常见动作的详细分解
// ═══════════════════════════════════════════════════════════════

const ACTION_LIBRARY: Record<string, ActionDetail> = {
  // 打电话
  '打电话': {
    name: '打电话',
    preparation: '右手从口袋或包里拿出手机，拇指按电源键点亮屏幕，拇指在屏幕上滑动解锁',
    mainAction: '右手将手机举到右耳旁，手机听筒紧贴右耳，屏幕朝向外侧，拇指自然搭在手机左侧边框，食指和中指在手机背面握持稳定',
    duringAction: '保持通话姿势，嘴巴在说话（嘴唇微动），偶尔点头，表情随对话内容变化，手指保持握持姿势，绝对不要触碰屏幕',
    endAction: '右手将手机从耳边移开，拇指按电源键熄灭屏幕，将手机放回口袋或包里',
    keyConstraints: [
      '手机必须紧贴耳朵，听筒对准耳道',
      '拨号完成后屏幕熄灭，绝对不要点屏幕',
      '拇指在手机侧面，不在屏幕上',
      '说话时嘴唇微动，不说话时嘴巴自然闭合',
    ],
    commonMistakes: [
      '手机没有贴在耳边，举在面前',
      '拨号完成后还在点屏幕',
      '拇指在屏幕上滑动',
      '手机屏幕朝向自己（应该朝向外侧）',
    ],
  },
  // 走路
  '走路': {
    name: '走路',
    preparation: '身体重心从后脚移到前脚，后脚脚跟抬起',
    mainAction: '左脚向前迈出，脚跟先着地，然后脚掌着地，重心移到左脚；右脚跟随向前迈出，手臂自然前后摆动（右手与左脚同步，左手与右脚同步）',
    duringAction: '保持稳定的步幅和节奏，身体微微前倾，头部保持稳定，眼神看向前方，表情自然',
    endAction: '双脚并拢，重心回到双脚中间，手臂自然下垂',
    keyConstraints: [
      '手臂必须自然摆动，与腿部同步',
      '脚跟先着地，然后脚掌着地',
      '身体重心随步伐转移',
      '头部保持稳定，不要上下晃动',
    ],
    commonMistakes: [
      '手臂不摆动，僵硬下垂',
      '同手同脚（右手与右脚同步）',
      '脚掌先着地，像机器人',
      '身体直立，没有重心转移',
    ],
  },
  // 奔跑
  '奔跑': {
    name: '奔跑',
    preparation: '身体大幅前倾，双膝微屈，双臂弯曲准备摆动',
    mainAction: '左脚用力蹬地，身体向前冲出，右脚向前大步迈出，脚掌着地；左脚跟随向前迈出，双臂大幅前后摆动（右手与左脚同步）',
    duringAction: '步幅大，频率快，身体前倾约15-20度，头部稳定，眼神看向前方，嘴巴微张呼吸，表情紧张或急切',
    endAction: '逐渐减速，步幅变小，最后双脚并拢停下，双手撑膝喘息（如果疲惫）',
    keyConstraints: [
      '身体必须前倾，不能直立',
      '手臂大幅摆动，弯曲约90度',
      '脚掌着地，不是脚跟',
      '嘴巴微张，呼吸急促',
    ],
    commonMistakes: [
      '身体直立奔跑，像走路',
      '手臂小幅度摆动',
      '脚跟先着地',
      '嘴巴紧闭，没有呼吸',
    ],
  },
  // 站立
  '站立': {
    name: '站立',
    preparation: '双脚分开与肩同宽，重心均匀分布在双脚',
    mainAction: '身体直立，脊柱自然挺直，肩膀放松下沉，双臂自然下垂在身体两侧，头部端正，眼神平视前方',
    duringAction: '保持稳定站姿，偶尔有微动作（重心在双脚间转移、手指轻微活动、头部轻微转动），表情自然',
    endAction: '无需结束动作',
    keyConstraints: [
      '重心均匀分布，不要偏向左脚或右脚',
      '肩膀放松，不要耸肩',
      '双臂自然下垂，不要僵硬',
      '偶尔有微动作，不要像雕像一样一动不动',
    ],
    commonMistakes: [
      '重心偏向左脚或右脚',
      '肩膀耸起，紧张',
      '双臂僵硬下垂，像机器人',
      '完全一动不动，像雕像',
    ],
  },
  // 对话
  '对话': {
    name: '对话',
    preparation: '身体朝向对话对象，眼神注视对方，表情准备好',
    mainAction: '说话时：嘴巴自然张合，嘴唇动作与台词同步，眼神注视对方，偶尔有手势辅助表达；听话时：嘴巴闭合，眼神注视对方，偶尔点头表示在听，表情随对方说话内容变化',
    duringAction: '身体微微前倾表示关注，手势自然（不要过度），眼神交流自然（不要一直盯着，偶尔移开再回来），表情随对话内容变化',
    endAction: '对话结束，身体回到自然姿态，眼神移开',
    keyConstraints: [
      '说话时嘴巴必须动，与台词同步',
      '听话时嘴巴闭合，不要乱动',
      '眼神注视对方，但不要一直盯着',
      '表情随对话内容变化',
    ],
    commonMistakes: [
      '说话时嘴巴不动',
      '听话时嘴巴乱动',
      '眼神不看对方，看别处',
      '一直盯着对方，不眨眼',
    ],
  },
  // 转身
  '转身': {
    name: '转身',
    preparation: '重心移到前脚，后脚脚跟抬起准备转动',
    mainAction: '以一只脚为轴，身体平滑转动，另一只脚跟随转动，头部最后转动（延迟约0.3秒），眼神先看新方向，然后身体跟随',
    duringAction: '转动过程平滑，不要突然停顿，手臂自然摆动辅助平衡，身体重心稳定',
    endAction: '双脚站稳，身体朝向新方向，头部转正，眼神看向前方',
    keyConstraints: [
      '头部转动要延迟，不要和身体同时转',
      '眼神先看新方向，然后身体跟随',
      '转动过程平滑，不要突然停顿',
      '以一只脚为轴，不要双脚同时跳',
    ],
    commonMistakes: [
      '头部和身体同时转，像机器人',
      '双脚同时跳着转',
      '转动过程突然停顿',
      '眼神不先看新方向',
    ],
  },
  // 坐下
  '坐下': {
    name: '坐下',
    preparation: '走到椅子前，转身背对椅子，一只脚向后试探椅子位置',
    mainAction: '双膝弯曲，身体缓慢下降，臀部接触椅子边缘，然后缓慢向后滑动直到坐稳，双手可以扶住椅子扶手',
    duringAction: '坐下过程缓慢稳定，不要突然坐下，背部逐渐靠向椅背，双脚平放在地面',
    endAction: '坐稳，背部靠在椅背上，双脚平放，双手放在大腿或扶手上',
    keyConstraints: [
      '必须先确认椅子位置，不要坐空',
      '坐下过程缓慢，不要突然坐下',
      '双脚平放在地面，不要悬空',
      '背部靠在椅背上，不要驼背',
    ],
    commonMistakes: [
      '没有确认椅子位置，坐空',
      '突然坐下，像摔倒',
      '双脚悬空',
      '驼背，背部不靠椅背',
    ],
  },
  // 起身
  '起身': {
    name: '起身',
    preparation: '身体微微前倾，重心移到双脚，双手可以扶住椅子扶手',
    mainAction: '双腿用力蹬地，身体缓慢上升，臀部离开椅子，双脚站稳，身体直立',
    duringAction: '起身过程稳定，不要突然站起，手臂自然摆动辅助平衡',
    endAction: '站稳，身体直立，双脚分开与肩同宽，双臂自然下垂',
    keyConstraints: [
      '身体先前倾，重心移到双脚',
      '起身过程稳定，不要突然站起',
      '双脚站稳后再移动',
      '不要用手撑膝盖（除非疲惫或年老）',
    ],
    commonMistakes: [
      '直接站起，身体没有前倾',
      '突然站起，像弹簧',
      '站起后脚步不稳',
      '用手撑膝盖（年轻角色不应该）',
    ],
  },
};

interface ActionDetail {
  name: string;
  preparation: string;
  mainAction: string;
  duringAction: string;
  endAction: string;
  keyConstraints: string[];
  commonMistakes: string[];
}

// ═══════════════════════════════════════════════════════════════
// 表情库：常见情绪的细微表情描述
// ═══════════════════════════════════════════════════════════════

const EXPRESSION_LIBRARY: Record<string, ExpressionDetail> = {
  '紧张': {
    name: '紧张',
    facial: '眉头微微皱起，眉心有浅纹，眼神略微躲闪，瞳孔微缩，嘴唇紧闭或微微张开，嘴角向下，面部肌肉轻微紧绷',
    micro: '偶尔吞咽口水，喉结上下移动，呼吸变浅变快，鼻翼轻微翕动，手指无意识地捏紧或摩挲',
    body: '身体微微僵硬，肩膀略微耸起，双手可能交握在身前，双脚不自觉地小幅度挪动',
    avoid: '不要过度夸张，不要面部扭曲，不要一直眨眼，不要嘴巴大张',
  },
  '焦虑': {
    name: '焦虑',
    facial: '眉头紧锁，眉心有深纹，眼神飘忽不定，频繁眨眼，嘴唇干燥可能舔嘴唇，嘴角向下紧绷',
    micro: '频繁吞咽，呼吸急促，鼻翼翕动明显，手指不停地摩挲或敲击，脚在地上轻敲',
    body: '身体坐立不安，频繁换姿势，肩膀高耸，双手可能抓头发或摸脸',
    avoid: '不要面部扭曲，不要一直摇头，不要过度手势',
  },
  '平静': {
    name: '平静',
    facial: '眉头舒展，眉心无纹，眼神平和稳定，自然眨眼，嘴唇自然闭合，嘴角微微上扬（中性偏愉悦），面部肌肉放松',
    micro: '呼吸平稳深长，偶尔自然吞咽，手指自然放松，身体有自然的微动作',
    body: '身体放松，肩膀自然下沉，姿态舒展，没有紧绷感',
    avoid: '不要面无表情像雕像，不要一直不眨眼，不要完全没有微动作',
  },
  '愤怒': {
    name: '愤怒',
    facial: '眉头紧锁，眉心有深纹，眉毛下压，眼神锐利直视，瞳孔放大，嘴唇紧抿成一条线，嘴角向下，下颌肌肉紧绷',
    micro: '呼吸加重，鼻翼翕动明显，可能咬牙（下颌肌肉紧绷），手指紧握成拳，身体微微颤抖',
    body: '身体前倾，肩膀紧绷，可能有指向性手势（手指指向对方），脚步可能向前逼近',
    avoid: '不要面部扭曲过度，不要大喊大叫（除非剧情需要），不要暴力动作',
  },
  '悲伤': {
    name: '悲伤',
    facial: '眉头微皱，眉心有浅纹，眼神黯淡，可能含泪，眼睑下垂，嘴角向下，嘴唇微微颤抖，面部肌肉松弛下垂',
    micro: '呼吸变浅，可能有抽泣，偶尔用手背擦眼睛，肩膀微微耸动（哭泣时），声音可能哽咽',
    body: '身体微微蜷缩，肩膀下垂，头可能微微低下，双手可能抱在胸前或放在膝盖上',
    avoid: '不要过度夸张哭泣，不要一直流泪，不要面部扭曲',
  },
  '惊讶': {
    name: '惊讶',
    facial: '眉毛上扬，眼睛睁大，瞳孔放大，嘴巴微微张开，可能倒吸一口气，面部肌肉瞬间紧绷然后放松',
    micro: '瞬间停顿（约0.3秒），然后身体有反应，可能后退一步，手可能抬起捂嘴',
    body: '身体瞬间僵硬，然后可能后退或前倾，头部可能微微后仰',
    avoid: '不要过度夸张，不要嘴巴大张太久，不要一直保持惊讶表情',
  },
  '恐惧': {
    name: '恐惧',
    facial: '眉头紧锁，眉毛上扬，眼睛睁大，瞳孔放大，眼神躲闪，嘴巴微微张开，嘴唇可能颤抖，面色苍白',
    micro: '呼吸急促浅短，可能倒吸冷气，身体微微颤抖，手指紧握，脚步可能后退',
    body: '身体后缩，肩膀高耸，可能有保护性姿态（双手挡在身前），脚步准备逃跑',
    avoid: '不要面部扭曲过度，不要一直颤抖，不要夸张尖叫',
  },
  '思考': {
    name: '思考',
    facial: '眉头微微皱起，眼神略微向上或向侧方看（不直视），嘴唇可能抿起或微微张开，偶尔眨眼',
    micro: '可能用手摸下巴或后脑勺，手指可能无意识地敲击，呼吸平稳，偶尔点头表示想到了什么',
    body: '身体可能微微前倾，头可能微微偏向一侧，姿态专注',
    avoid: '不要一直皱眉，不要眼神呆滞，不要过度手势',
  },
};

interface ExpressionDetail {
  name: string;
  facial: string;
  micro: string;
  body: string;
  avoid: string;
}

// ═══════════════════════════════════════════════════════════════
// 心理活动→外在表现映射
// ═══════════════════════════════════════════════════════════════

const PSYCHOLOGY_TO_PHYSICAL: Record<string, string> = {
  '紧张不安': '手指无意识地摩挲，双脚小幅度挪动，眼神偶尔躲闪，呼吸变浅，偶尔吞咽口水',
  '下定决心': '眉头紧锁然后舒展，眼神变得坚定，下巴微微抬起，深呼吸一次，身体从犹豫变为稳定',
  '内心挣扎': '眼神在两个方向之间游移，眉头微皱，嘴唇抿起又松开，手指捏紧又放松，身体微微前倾又后缩',
  '突然意识到': '眼神瞬间聚焦，眉毛上扬，嘴巴微微张开，身体瞬间停顿约0.3秒，然后有反应',
  '回忆往事': '眼神略微向上或向侧方看（不直视），眉头微微皱起，表情变得柔和或悲伤，呼吸变慢，可能有短暂的出神',
  '感到愧疚': '眼神向下看，不敢直视，眉头微皱，嘴角向下，肩膀微微下垂，可能用手摸后颈或后脑勺',
  '感到怀疑': '眉头微皱，眼神审视，嘴角微微上扬（怀疑的笑），头微微偏向一侧，可能交叉双臂',
  '感到期待': '眼神明亮，嘴角微微上扬，身体微微前倾，呼吸略微加快，可能有不自觉的微笑',
  '感到失望': '眼神黯淡，眼睑下垂，嘴角向下，肩膀下垂，身体微微蜷缩，呼吸变浅',
  '感到释然': '眉头舒展，长舒一口气，肩膀下沉，身体放松，眼神变得柔和，可能有淡淡的微笑',
};

// ═══════════════════════════════════════════════════════════════
// 服务实现
// ═══════════════════════════════════════════════════════════════

export const directorPromptService = {
  /**
   * 生成导演级视频提示词
   */
  generateVideoPrompt(
    shotContext: DirectorShotContext,
    _scriptAnalysis?: ScriptAnalysisResult
  ): DirectorPromptResult {
    const optimizations: string[] = [];
    const timeline: TimelineSegment[] = [];

    // ═══════════════════════════════════════════════════════════
    // 第1层：时序控制 — 精确时间轴分解
    // ═══════════════════════════════════════════════════════════
    const duration = shotContext.duration || 5;
    const segments = this.decomposeTimeline(duration, shotContext);
    timeline.push(...segments);
    optimizations.push(`时序分解：${segments.length}个时间段`);

    // ═══════════════════════════════════════════════════════════
    // 第2层：动作分解 — 从动作库匹配并细化
    // ═══════════════════════════════════════════════════════════
    const actionDetail = this.matchAndDecomposeAction(shotContext.actionDescription);
    optimizations.push(`动作分解：${actionDetail ? actionDetail.name : '自定义动作'}`);

    // ═══════════════════════════════════════════════════════════
    // 第3层：表情细节 — 从表情库匹配
    // ═══════════════════════════════════════════════════════════
    const emotion = shotContext.mood || this.inferEmotion(shotContext.actionDescription);
    const expressionDetail = EXPRESSION_LIBRARY[emotion] || EXPRESSION_LIBRARY['平静'];
    optimizations.push(`表情细节：${expressionDetail.name}`);

    // ═══════════════════════════════════════════════════════════
    // 第4层：心理活动 — 推断并转化为外在表现
    // ═══════════════════════════════════════════════════════════
    const psychology = this.inferPsychology(shotContext, emotion);
    const physicalExpression = psychology ? PSYCHOLOGY_TO_PHYSICAL[psychology] : null;
    if (psychology) {
      optimizations.push(`心理活动：${psychology}`);
    }

    // ═══════════════════════════════════════════════════════════
    // 第5层：环境交互 — 角色与环境/物体的交互
    // ═══════════════════════════════════════════════════════════
    const environmentInteraction = this.generateEnvironmentInteraction(shotContext);
    optimizations.push('环境交互描述');

    // ═══════════════════════════════════════════════════════════
    // 第6层：连贯性 — 前后镜头衔接
    // ═══════════════════════════════════════════════════════════
    const continuity = this.generateContinuity(shotContext);
    optimizations.push('前后镜头连贯性约束');

    // ═══════════════════════════════════════════════════════════
    // 第7层：真实性校验 — 物理/生理/逻辑合理性
    // ═══════════════════════════════════════════════════════════
    const realityCheck = this.generateRealityCheck(shotContext, actionDetail);
    optimizations.push('真实性校验约束');

    // ═══════════════════════════════════════════════════════════
    // 组装完整提示词
    // ═══════════════════════════════════════════════════════════
    const promptParts: string[] = [];

    // 镜头基本信息
    promptParts.push(`【镜头信息】第${shotContext.shotNumber}/${shotContext.totalShots}镜，时长${duration}秒，${this.translateShotSize(shotContext.shotSize)}，${this.translateCameraMovement(shotContext.cameraMovement)}`);

    // 场景环境
    if (shotContext.sceneName || shotContext.sceneDescription) {
      promptParts.push(`【场景环境】${shotContext.sceneName || ''}${shotContext.sceneDescription ? '：' + shotContext.sceneDescription : ''}${shotContext.timeOfDay ? '，时段：' + shotContext.timeOfDay : ''}${shotContext.weather ? '，天气：' + shotContext.weather : ''}`);
    }

    // 时序分解（核心）
    promptParts.push('\n【时序分解】（严格按照时间顺序执行）');
    segments.forEach((seg, i) => {
      promptParts.push(`${i + 1}. ${seg.startTime}-${seg.endTime}秒：${seg.description}`);
      promptParts.push(`   动作：${seg.action}`);
      promptParts.push(`   表情：${seg.expression}`);
      promptParts.push(`   镜头：${seg.camera}`);
    });

    // 动作详细分解
    if (actionDetail) {
      promptParts.push(`\n【动作详解】${actionDetail.name}`);
      promptParts.push(`准备动作：${actionDetail.preparation}`);
      promptParts.push(`主要动作：${actionDetail.mainAction}`);
      promptParts.push(`过程中：${actionDetail.duringAction}`);
      promptParts.push(`结束动作：${actionDetail.endAction}`);
      promptParts.push(`关键约束：${actionDetail.keyConstraints.join('；')}`);
      promptParts.push(`⚠️ 避免错误：${actionDetail.commonMistakes.join('；')}`);
    } else {
      promptParts.push(`\n【动作描述】${shotContext.actionDescription}`);
    }

    // 表情细节
    promptParts.push(`\n【表情细节】情绪：${expressionDetail.name}`);
    promptParts.push(`面部：${expressionDetail.facial}`);
    promptParts.push(`微动作：${expressionDetail.micro}`);
    promptParts.push(`身体：${expressionDetail.body}`);
    promptParts.push(`⚠️ 避免：${expressionDetail.avoid}`);

    // 心理活动
    if (psychology && physicalExpression) {
      promptParts.push(`\n【心理活动】${psychology}`);
      promptParts.push(`外在表现：${physicalExpression}`);
    }

    // 角色信息
    if (shotContext.charactersInShot && shotContext.charactersInShot.length > 0) {
      promptParts.push(`\n【角色信息】`);
      shotContext.charactersInShot.forEach(charName => {
        const detail = shotContext.characterDetails?.[charName];
        if (detail) {
          promptParts.push(`- ${charName}：${detail.appearance || '外貌未指定'}，${detail.personality || '性格未指定'}，当前情绪：${detail.currentEmotion || emotion}，手持：${detail.propsHolding || '无'}`);
        } else {
          promptParts.push(`- ${charName}`);
        }
      });
    }

    // 环境交互
    promptParts.push(`\n【环境交互】${environmentInteraction}`);

    // 连贯性
    promptParts.push(`\n【连贯性约束】${continuity}`);

    // 真实性校验
    promptParts.push(`\n【真实性校验】${realityCheck}`);

    // 对话
    if (shotContext.dialogue) {
      promptParts.push(`\n【对话】${shotContext.dialogue}`);
      promptParts.push(`说话时嘴巴自然张合，与台词同步；不说话时嘴巴闭合。`);
    }

    // 质量要求
    promptParts.push(`\n【质量要求】电影级画质，8K超高清，极致细节，浅景深，真实光影，物理级渲染，人物一致性，场景一致性，动作准确性，表情自然，前后镜头连贯`);

    const finalPrompt = promptParts.join('\n');

    return {
      prompt: finalPrompt,
      negativePrompt: DIRECTOR_NEGATIVE_PROMPTS.join('，'),
      optimizations,
      timeline,
    };
  },

  /**
   * 生成导演级关键帧提示词
   */
  generateKeyframePrompt(
    shotContext: DirectorShotContext,
    scriptAnalysis?: ScriptAnalysisResult
  ): DirectorPromptResult {
    // 复用视频提示词的生成逻辑，但简化时序部分（关键帧是静态画面）
    const result = this.generateVideoPrompt(shotContext, scriptAnalysis);

    // 关键帧不需要时序分解，替换为画面定格描述
    const frameContent = shotContext.frameSpecificDescription || shotContext.actionDescription;
    const frameKindText = shotContext.frameType === 'last'
      ? '这是镜头结束的最后一帧，画面内容为动作完成后的结果定格：人物姿势、位置、表情、道具均处于动作结束后的状态。本帧必须与首帧画面有明确的动作状态差异（例如首帧举鞭欲抽，本帧鞭已抽下）'
      : '这是镜头开始的第一帧，画面内容为动作起始瞬间的静态定格：人物姿势、位置、表情、道具均处于动作开始前的状态。后续视频将从本帧画面对应状态出发展开动作';
    const keyframePrompt = result.prompt
      .replace(/【时序分解】[\s\S]*?(?=\n【动作详解】|\n【动作描述】)/, 
        `【画面定格】${frameKindText}\n画面内容：${frameContent}\n要求：画面稳定，焦点清晰，光影自然，为后续视频生成提供准确的参考。`);

    return {
      ...result,
      prompt: keyframePrompt,
      optimizations: [...result.optimizations, '关键帧定格优化'],
    };
  },

  // ═══════════════════════════════════════════════════════════
  // 内部方法：时序分解
  // ═══════════════════════════════════════════════════════════
  decomposeTimeline(duration: number, context: DirectorShotContext): TimelineSegment[] {
    const segments: TimelineSegment[] = [];
    const action = context.actionDescription || '';
    const emotion = context.mood || '平静';

    if (duration <= 3) {
      // 短镜头：一个时间段
      segments.push({
        startTime: 0,
        endTime: duration,
        description: '整个镜头保持同一动作和情绪',
        action: action,
        expression: `${emotion}表情，自然微动作`,
        camera: this.translateCameraMovement(context.cameraMovement),
      });
    } else if (duration <= 6) {
      // 中等镜头：2-3个时间段
      const midPoint = Math.floor(duration / 2);
      segments.push({
        startTime: 0,
        endTime: midPoint,
        description: '动作开始/准备阶段',
        action: `${action}（动作开始）`,
        expression: `${emotion}表情，动作起始状态`,
        camera: this.translateCameraMovement(context.cameraMovement),
      });
      segments.push({
        startTime: midPoint,
        endTime: duration,
        description: '动作进行/完成阶段',
        action: `${action}（动作进行/完成）`,
        expression: `${emotion}表情，动作持续状态，可能有微变化`,
        camera: this.translateCameraMovement(context.cameraMovement),
      });
    } else {
      // 长镜头：3-4个时间段
      const seg1End = Math.floor(duration * 0.3);
      const seg2End = Math.floor(duration * 0.6);
      segments.push({
        startTime: 0,
        endTime: seg1End,
        description: '动作准备/开始阶段',
        action: `${action}（准备/开始）`,
        expression: `${emotion}表情，准备状态`,
        camera: this.translateCameraMovement(context.cameraMovement),
      });
      segments.push({
        startTime: seg1End,
        endTime: seg2End,
        description: '动作主要进行阶段',
        action: `${action}（主要进行）`,
        expression: `${emotion}表情，动作高峰状态`,
        camera: this.translateCameraMovement(context.cameraMovement),
      });
      segments.push({
        startTime: seg2End,
        endTime: duration,
        description: '动作收尾/结束阶段',
        action: `${action}（收尾/结束）`,
        expression: `${emotion}表情，动作结束状态，可能有情绪变化`,
        camera: this.translateCameraMovement(context.cameraMovement),
      });
    }

    return segments;
  },

  // ═══════════════════════════════════════════════════════════
  // 内部方法：动作匹配与分解
  // ═══════════════════════════════════════════════════════════
  matchAndDecomposeAction(actionDescription: string): ActionDetail | null {
    if (!actionDescription) return null;

    // 关键词匹配
    for (const [key, detail] of Object.entries(ACTION_LIBRARY)) {
      if (actionDescription.includes(key)) {
        return detail;
      }
    }

    // 模糊匹配
    if (actionDescription.includes('电话') || actionDescription.includes('手机') || actionDescription.includes('通话')) {
      return ACTION_LIBRARY['打电话'];
    }
    if (actionDescription.includes('走') || actionDescription.includes('步行') || actionDescription.includes('散步')) {
      return ACTION_LIBRARY['走路'];
    }
    if (actionDescription.includes('跑') || actionDescription.includes('奔跑') || actionDescription.includes('冲')) {
      return ACTION_LIBRARY['奔跑'];
    }
    if (actionDescription.includes('站') || actionDescription.includes('站立') || actionDescription.includes('伫立')) {
      return ACTION_LIBRARY['站立'];
    }
    if (actionDescription.includes('说') || actionDescription.includes('对话') || actionDescription.includes('交谈') || actionDescription.includes('讲')) {
      return ACTION_LIBRARY['对话'];
    }
    if (actionDescription.includes('转身') || actionDescription.includes('回头') || actionDescription.includes('转过去')) {
      return ACTION_LIBRARY['转身'];
    }
    if (actionDescription.includes('坐') || actionDescription.includes('坐下')) {
      return ACTION_LIBRARY['坐下'];
    }
    if (actionDescription.includes('起身') || actionDescription.includes('站起来') || actionDescription.includes('站起')) {
      return ACTION_LIBRARY['起身'];
    }

    return null;
  },

  // ═══════════════════════════════════════════════════════════
  // 内部方法：情绪推断
  // ═══════════════════════════════════════════════════════════
  inferEmotion(actionDescription: string): string {
    if (!actionDescription) return '平静';

    if (actionDescription.includes('紧张') || actionDescription.includes('焦虑') || actionDescription.includes('不安')) return '紧张';
    if (actionDescription.includes('愤怒') || actionDescription.includes('生气') || actionDescription.includes('怒')) return '愤怒';
    if (actionDescription.includes('悲伤') || actionDescription.includes('难过') || actionDescription.includes('哭') || actionDescription.includes('泪')) return '悲伤';
    if (actionDescription.includes('惊讶') || actionDescription.includes('吃惊') || actionDescription.includes('震惊')) return '惊讶';
    if (actionDescription.includes('恐惧') || actionDescription.includes('害怕') || actionDescription.includes('怕') || actionDescription.includes('惊恐')) return '恐惧';
    if (actionDescription.includes('思考') || actionDescription.includes('想') || actionDescription.includes('考虑')) return '思考';

    return '平静';
  },

  // ═══════════════════════════════════════════════════════════
  // 内部方法：心理活动推断
  // ═══════════════════════════════════════════════════════════
  inferPsychology(context: DirectorShotContext, emotion: string): string | null {
    const action = context.actionDescription || '';

    if (action.includes('犹豫') || action.includes('纠结') || action.includes('挣扎')) return '内心挣扎';
    if (action.includes('决定') || action.includes('下定决心') || action.includes('咬牙')) return '下定决心';
    if (action.includes('意识到') || action.includes('突然明白') || action.includes('恍然大悟')) return '突然意识到';
    if (action.includes('回忆') || action.includes('想起') || action.includes('往事')) return '回忆往事';
    if (action.includes('愧疚') || action.includes('对不起') || action.includes('抱歉')) return '感到愧疚';
    if (action.includes('怀疑') || action.includes('不信') || action.includes('质疑')) return '感到怀疑';
    if (action.includes('期待') || action.includes('盼望') || action.includes('等')) return '感到期待';
    if (action.includes('失望') || action.includes('失落') || action.includes('沮丧')) return '感到失望';
    if (action.includes('释然') || action.includes('放松') || action.includes('松了口气')) return '感到释然';
    if (emotion === '紧张' || emotion === '焦虑') return '紧张不安';

    return null;
  },

  // ═══════════════════════════════════════════════════════════
  // 内部方法：环境交互生成
  // ═══════════════════════════════════════════════════════════
  generateEnvironmentInteraction(context: DirectorShotContext): string {
    const parts: string[] = [];
    const weather = context.weather || '';
    const scene = context.sceneDescription || context.sceneName || '';

    // 雨天交互
    if (weather.includes('雨') || scene.includes('雨')) {
      parts.push('雨滴从天空落下，打在人物身上、头发上、肩膀上，衣服被雨水打湿贴在身上，头发上有雨滴滑落，地面有积水，人物行走时溅起水花，雨伞（如果有）上有雨滴滚落，雨丝在灯光下可见');
    }

    // 夜晚交互
    if (context.timeOfDay?.includes('夜') || scene.includes('夜')) {
      parts.push('环境光线较暗，主要光源来自路灯、霓虹灯、车灯等，人物面部有光影变化，远处有灯光朦胧，地面有灯光倒影，人物在灯光下有明显的光影对比');
    }

    // 室内交互
    if (scene.includes('室内') || scene.includes('房间') || scene.includes('办公室')) {
      parts.push('室内环境，光线来自顶灯或台灯，人物在室内空间中活动，与家具有合理的空间关系，物体在桌面上有合理的位置，人物动作不会穿墙或穿家具');
    }

    // 通用环境交互
    parts.push('人物与环境中的物体有合理的空间关系，不会穿墙、穿家具、穿物体，人物的影子与光源方向一致，人物在地面上有合理的接触点，不会漂浮');

    return parts.join('；');
  },

  // ═══════════════════════════════════════════════════════════
  // 内部方法：连贯性生成
  // ═══════════════════════════════════════════════════════════
  generateContinuity(context: DirectorShotContext): string {
    const parts: string[] = [];

    // 前一个镜头衔接
    if (context.previousShotAction) {
      parts.push(`前一个镜头内容：${context.previousShotAction}。当前镜头必须承接前一个镜头的动作和状态，角色位置、姿势、表情、道具必须与前一个镜头连贯，不要突然变化`);
    }

    // 角色连贯性
    if (context.charactersInShot && context.charactersInShot.length > 0) {
      parts.push(`出场角色：${context.charactersInShot.join('、')}。所有角色的外貌（发型、服装、面部特征）必须与前后镜头严格一致，不得改变，不得换脸，不得换装`);
    }

    // 道具连贯性
    parts.push('角色手持的道具必须与前后镜头一致，不要突然出现或消失，道具的位置和状态必须连贯');

    // 环境连贯性
    parts.push('场景环境（地点、光线、天气、家具布置）必须与前后镜头一致，不要突然变化');

    // 情绪连贯性
    parts.push('角色情绪必须与前后镜头连贯，不要突然从悲伤变为开心，情绪变化要有过渡');

    return parts.join('；');
  },

  // ═══════════════════════════════════════════════════════════
  // 内部方法：真实性校验
  // ═══════════════════════════════════════════════════════════
  generateRealityCheck(context: DirectorShotContext, actionDetail: ActionDetail | null): string {
    const parts: string[] = [];

    // 物理真实性
    parts.push('物理规律：重力正确，物体不会漂浮，液体自然流动，碰撞有合理反应，动作有惯性，不会瞬间加速或停止');

    // 生理真实性
    parts.push('生理规律：人体解剖正确，手指数量正确，关节活动范围合理，呼吸自然，表情肌肉运动合理，不会有反人类的动作');

    // 动作逻辑真实性
    if (actionDetail) {
      parts.push(`动作逻辑：${actionDetail.name}必须符合实际，${actionDetail.keyConstraints.join('，')}`);
      parts.push(`⚠️ 绝对不要出现以下错误：${actionDetail.commonMistakes.join('，')}`);
    }

    // 物体交互真实性
    parts.push('物体交互：手与物体的接触点合理，手指不会穿透物体，物体不会穿模，握持姿势合理，操作物体的动作符合实际');

    // 时序真实性
    parts.push('时序逻辑：动作有先后顺序，先准备后执行，先开始后结束，不会出现时序颠倒（如拨号完成后还在点屏幕）');

    // 空间真实性
    parts.push('空间逻辑：人物与环境的空间关系合理，不会穿墙、穿家具，人物的移动路径合理，不会瞬间移动');

    return parts.join('；');
  },

  // ═══════════════════════════════════════════════════════════
  // 翻译方法
  // ═══════════════════════════════════════════════════════════
  translateShotSize(shotSize: string): string {
    const map: Record<string, string> = {
      extreme_wide: '大远景，展现场景全貌',
      long: '远景，人物全身与环境',
      full: '全景，完整动作',
      medium: '中景，膝盖以上',
      medium_closeup: '近景，胸部以上',
      closeup: '特写，肩部以上，情绪聚焦',
      extreme_closeup: '大特写，细节强调',
    };
    return map[shotSize] || shotSize || '中景';
  },

  translateCameraMovement(movement: string): string {
    const map: Record<string, string> = {
      push_in: '镜头缓慢推近，聚焦主体情绪',
      pull_out: '镜头缓慢拉远，展现场景环境',
      pan: '镜头水平摇移，跟随动作',
      tilt: '镜头垂直升降，揭示空间',
      truck: '摄像机平行移动跟随人物',
      crane: '镜头升降运动，宏大场面',
      handheld: '手持镜头，轻微晃动，纪实紧张感',
      steadicam: '稳定器平滑跟随，长镜头',
      static: '固定镜头，稳定画面',
    };
    return map[movement] || movement || '固定镜头';
  },

  /**
   * 获取动作库列表（用于UI展示）
   */
  getActionLibrary(): string[] {
    return Object.keys(ACTION_LIBRARY);
  },

  /**
   * 获取表情库列表（用于UI展示）
   */
  getExpressionLibrary(): string[] {
    return Object.keys(EXPRESSION_LIBRARY);
  },

  /**
   * 获取心理活动映射列表（用于UI展示）
   */
  getPsychologyLibrary(): string[] {
    return Object.keys(PSYCHOLOGY_TO_PHYSICAL);
  },
};
