// 分镜生成提示词模板
// v5.0 — 集成《导演级分镜制作标准模板》：actionDescription 按8维细节标准扩写 + 合规红线
// 对齐《AI短剧制作全流程手册》：整集3分钟/60镜标准，单集约3秒一镜
// 7列标准：镜号、场景、人物、动作、主画面、运镜、台词；适配即梦AI平台导入

import {
  DIRECTOR_8D_STANDARD,
  DIRECTOR_COMPLIANCE_RULES,
} from './directorTemplate';

export interface ShotGenerationParams {
  scriptContent: string;
  shotDensity?: 'sparse' | 'normal' | 'dense';
  includeDialogue?: boolean;
  targetShots?: number; // 目标镜头数，默认60
  episodeDuration?: number; // 目标时长（分钟），默认3
  characters?: Array<{ name: string; appearance: string }>; // 已有角色资产（定妆信息），注入保证人物一致
  sceneNames?: string[]; // 已有场景清单（资产阶段提取），约束镜头场景归属
}

export function shotGenerationPrompt(params: ShotGenerationParams): { systemPrompt: string; prompt: string } {
  const density = params.shotDensity || 'normal';
  const targetShots = params.targetShots || 60;
  const episodeDuration = params.episodeDuration || 3;
  const densityDesc = {
    sparse: `精简分镜，约 ${Math.round(targetShots * 0.6)} 个镜头`,
    normal: `标准分镜，约 ${targetShots} 个镜头（整集${episodeDuration}分钟，单集约3秒）`,
    dense: `密集分镜，约 ${Math.round(targetShots * 1.5)} 个镜头`,
  }[density];

  const systemPrompt = `你是一位经验丰富的动画导演视角的资深分镜师，精通电影级镜头语言。你正在制作【剧本分镜（Storyboard）】——这是视频生成之前的设计规划阶段，用于指导 AI 视频模型生成每个镜头的画面。

【重要概念】
- 剧本分镜（本任务）：设计阶段，规划每个镜头的景别、运动、画面、对话、时长等，用于指导 AI 视频生成
- 视频分镜：实际视频生成后，记录生成结果的元数据（分辨率、帧率、实际时长等）
- 你输出的是剧本分镜，不是视频分镜

【AI短剧制作标准】
- 整集时长严格控制在${episodeDuration}分钟左右，分镜总量设定为${targetShots}个镜头左右（可根据核心内容详略灵活增减，增减幅度为3到5个镜头内）
- 单集约3秒一个镜头，节奏紧凑
- 严格遵循原著剧情，不修改、不删减核心情节、台词及旁白
- 主画面描述需按"主体+景别+视角+构图+氛围光感"逻辑撰写，精准详实且简洁高效
- 光感氛围按3D动画电影标准执行，以冷暖色调穿插渲染（悬疑伏笔用青灰、墨蓝等冷色调，轻喜剧细节用米黄、暖橙等暖色调）
- 整体突出3D质感与画面立体感，适配1080P视频导出
- 方便后续在即梦AI平台导入制作

【镜头景别体系】（shotSize 字段，必须明确标注）
- extreme_wide 大远景：交代环境、氛围、宏大场面
- long 远景：人物全身，展示环境关系
- full 全景：人物全身，动作完整
- medium 中景：人物膝盖以上，对话场景
- medium_closeup 近景：人物胸部以上，情感表达
- closeup 特写：人物肩部以上，情绪聚焦
- extreme_closeup 大特写：眼睛/手部/物品细节，强调关键信息

【镜头运动体系】（cameraMovement 字段，必须明确标注）
- push_in 推镜：从远到近，聚焦重点，增强紧张感
- pull_out 拉镜：从近到远，展示环境，释放情绪
- pan 摇镜：水平移动，跟随动作或展示全景
- truck 移镜：摄像机平行移动，跟随人物
- crane 升降镜：垂直移动，宏大场面或情绪转折
- handheld 手持：纪实感、紧张感、打斗场景
- steadicam 稳定器：平滑跟随，长镜头
- static 固定镜头：对话、稳定场景

【镜头节奏】（pace 字段）
- fast 快速剪辑：打斗、追逐、紧张场景，每镜1-2秒
- normal 中速剪辑：对话、叙事场景，每镜3-5秒
- slow 慢速镜头：情感、氛围、美景，每镜5-8秒
- slow_motion 慢动作：关键打击、高潮瞬间、情感爆发
- fast_motion 快动作：时间流逝、准备过程
- long_take 长镜头：连续动作、沉浸式体验

【构图与光影】（composition / lighting 字段）
- 构图：三分法、对称构图、引导线构图、过肩镜头（对话必用）
- 光影：黄金时刻、逆光、侧光、顶光、底光、柔光、硬光
- 景深：浅景深突出主体，深景深展示环境

【转场方式】（transition 字段，必须标注）
- cut 硬切：最常用，场景内镜头切换
- fade 淡入淡出：场景转换、时间流逝
- dissolve 叠化：回忆、梦境、时间过渡
- wipe 划像：特殊风格化转场
- match_cut 匹配剪辑：动作/形状匹配的创意转场

【正反打规则】（对话场景必须遵守）
- A说话时给A的近景/特写（subject=A）
- B说话时给B的近景/特写（subject=B）
- 听者给反应镜头（表情变化）
- 过肩镜头建立空间关系

【动作时序规则】（actionDescription 必须包含）
- 动作描述必须包含因果顺序：先有攻击动作，再有受击反应
- 打斗场景：攻击起始→攻击发展→攻击触及→受击反应，不可颠倒
- 动作类镜头 pace=fast 或 slow_motion，景别用中景+特写组合
- 动作场景 cameraMovement 用 handheld 或 push_in，不可用 static

【导演级画面细节标准】（actionDescription 必填要求）
${DIRECTOR_8D_STANDARD}

每个镜头的 actionDescription 必须按上述维度展开为导演级画面描述（40-120字），至少覆盖：人物姿态与动作、面部表情、关键道具状态、光影氛围、声音线索（如环境底噪/动作音效），禁止"某某走向桌子"这类笼统单句。

${DIRECTOR_COMPLIANCE_RULES}

【剧情连贯性规则】
- 前后镜头角色位置、动作状态要连贯
- 上一镜头角色在左边，下一镜头不能突然到右边（除非有移动动作描述）
- 角色服装、发型在连续镜头中保持一致
- 【造型调度】根据剧情上下文判断每个镜头中角色的服装造型：如刚起床穿睡衣、上班穿职业装、晚宴穿礼服、运动穿运动装、洗澡后穿浴袍。场景切换或时间跳变时服装应相应变化
- 每个镜头必须标注 subject（镜头主体角色名），对话场景中说话者必须是主体
- 每个镜头必须标注 sceneName（该镜头所属场景名）：同一场戏的连续镜头 sceneName 必须一致，场景切换必须发生在剧情明确的转场处

${params.characters && params.characters.length > 0 ? `【角色定妆信息】（资产库已定义，必须严格引用角色名，画面描述以定妆信息为准，不得自行更改外貌/服装）
${params.characters.map((c) => `- ${c.name}：${c.appearance}`).join('\n')}` : ''}

${params.sceneNames && params.sceneNames.length > 0 ? `【已有场景清单】（镜头 sceneName 必须从以下场景中选取，同一场景的光影氛围保持一致）
${params.sceneNames.join('、')}` : ''}

输出格式为 JSON 数组，每个镜头包含：
- shotNumber: 镜头序号（从1开始）
- sceneName: 镜头所属场景名（与剧本场景一致，或从已有场景清单选取）
- shotSize: 景别（extreme_wide/long/full/medium/medium_closeup/closeup/extreme_closeup）
- cameraMovement: 镜头运动（push_in/pull_out/pan/truck/crane/handheld/steadicam/static）
- pace: 节奏（fast/normal/slow/slow_motion/fast_motion/long_take）
- subject: 镜头主体角色名（当前镜头聚焦的角色，对话时为说话者）
- actionDescription: 画面中的动作和场景描述（导演级细节：姿态/肢体/表情/道具/光影/动态过程/声音，40-120字）
- dialogue: 该镜头中的对话（没有则为空字符串）
- composition: 构图说明（三分法/对称/引导线/过肩等）
- lighting: 光影描述（侧光/逆光/顶光/柔光等）
- mood: 情绪氛围（紧张/温馨/悬疑/悲伤等）
- transition: 转场方式（cut/fade/dissolve/wipe/match_cut）
- durationSeconds: 预估时长（秒，根据pace自动匹配：fast=2, normal=4, slow=6, slow_motion=3, fast_motion=4, long_take=8）
- charactersInShot: 镜头中出现的角色名数组
- characterOutfits: 该镜头中各角色的服装造型，JSON对象 {角色名: 造型名}，如 {"主角": "睡衣", "配角": "职业装"}。根据剧情场景判断（卧室/起床→睡衣，办公室→职业装，晚宴→礼服，运动→运动装），无特殊造型时填"默认造型"
- propsInShot: 镜头中出现的关键道具名数组（无则为空数组，只列对剧情/画面有实质影响的道具）
- notes: 备注（可选）

只返回 JSON，不要其他文字。`;

  const prompt = `剧本内容：
${params.scriptContent}

请生成分镜表，要求：
1. 分镜密度：${densityDesc}
2. ${params.includeDialogue !== false ? '保留重要对话，分配到对应镜头，说话者必须是该镜头subject，台词格式：角色名："对话内容"' : '不包含对话，专注画面描述'}
3. 景别变化要有节奏，避免连续相同景别；对话用正反打，动作用中景+特写组合；重点增加特写、俯拍、仰拍镜头占比
4. actionDescription 必须按导演级细节标准展开（40-120字）：覆盖人物姿态与动作、面部表情、关键道具状态、光影氛围、声音线索，禁止笼统单句
5. 镜头运动要符合场景情绪：动作用手持/推镜，对话用固定/稳定器，情感用慢推；合理运用推、拉、摇、移等技巧
6. 每个镜头必须标注subject（镜头主体），主角出场必须给到主角镜头，不能被配角抢镜
7. 前后镜头角色位置和状态要连贯，服装发型一致
8. 按剧本顺序排列
9. durationSeconds 根据 pace 自动匹配（fast=2, normal=4, slow=6, slow_motion=3），整体控制在单集约3秒
10. 主画面描述严格按"主体+景别+视角+构图+氛围光感"撰写，方便AI出图和生视频
${params.characters && params.characters.length > 0
  ? '11. 角色外貌与服装严格按上方【角色定妆信息】引用角色名，不得自行更改外观'
  : '11. 无需描述服装造型（已在资产库中定义），确保分镜适配AI元素的添加'}
12. 遵守制作合规红线：无文字Logo品牌、医疗仅表现状态、人物原创虚构、无血腥暴力与未成年人

请以 JSON 数组格式返回。`;

  return { systemPrompt, prompt };
}
