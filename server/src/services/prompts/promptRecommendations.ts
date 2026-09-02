// 全流程提示词推荐模块 v1.0
// 为每个环节提供正面提示词推荐、负面提示词、风格预设
// 覆盖：小说→剧集→角色→场景→分镜→关键帧→配音→视频

// ═══════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════

export type PipelineStage =
  | 'novel_to_script'    // 小说转剧集
  | 'character_extract'  // 角色提取
  | 'scene_extract'      // 场景提取
  | 'shot_generation'    // 分镜生成
  | 'keyframe'           // 关键帧生成
  | 'tts'                // 配音生成
  | 'video';             // 视频生成

export interface PromptRecommendation {
  /** 环节名称 */
  stage: PipelineStage;
  /** 环节中文名 */
  stageName: string;
  /** 正面提示词推荐（可直接追加到 prompt 中） */
  positivePrompts: string[];
  /** 负面提示词（避免出现的问题） */
  negativePrompts: string[];
  /** 质量提升技巧 */
  tips: string[];
}

export interface StylePreset {
  /** 预设ID */
  id: string;
  /** 预设名称 */
  name: string;
  /** 风格分类 */
  category: string;
  /** 风格描述 */
  description: string;
  /** 视觉风格提示词（用于关键帧/视频） */
  visualStyle: string;
  /** 镜头语言提示词 */
  cameraLanguage: string;
  /** 色调/调色 */
  colorPalette: string;
  /** 节奏风格 */
  rhythm: string;
  /** 适用场景 */
  suitableFor: string[];
}

// ═══════════════════════════════════════════════════════════════
// 各环节提示词推荐
// ═══════════════════════════════════════════════════════════════

const PROMPT_RECOMMENDATIONS: Record<PipelineStage, PromptRecommendation> = {
  // ── 1. 小说转剧集 ──
  novel_to_script: {
    stage: 'novel_to_script',
    stageName: '小说转剧集',
    positivePrompts: [
      '严格保留原文核心情节、人物对话、场景描写，不得删减或概括',
      '将叙述性文字转化为剧本格式（场景+动作+对话），内容量保持不变',
      '每集包含明确的起承转合，保留原著叙事节奏',
      '人物对话符合角色性格，重要对话原样保留',
      '场景描写具体详细，包含时间、地点、环境氛围、人物动作表情',
    ],
    negativePrompts: [
      '禁止只输出大纲、梗概或情节摘要',
      '禁止将多段对话合并为一句概括',
      '禁止省略环境描写和动作描写',
      '禁止添加原文没有的情节或人物',
      '禁止修改人物动机、关系或结局',
      '禁止改变故事发生的时代背景或地点',
    ],
    tips: [
      '每集剧本不少于800字，至少包含3个场景',
      'chapterRange 必须填写对应原文章节范围',
      '输出 plotPoints 字段，列出3-5个关键情节节点便于核对',
      '如果原文有明确集数标记，严格按原集数划分',
    ],
  },

  // ── 2. 角色提取 ──
  character_extract: {
    stage: 'character_extract',
    stageName: '角色提取',
    positivePrompts: [
      '提取所有有台词或重要动作的角色，包括主角、配角、反派、路人',
      'visualDescription 必须详细：年龄段、发型发色、面部特征、服装风格、体态体型、标志性特征、气质',
      'description 包含性格特点和在故事中的作用',
      '按重要程度排序，主角在前，配角次之，路人最后',
      '同名角色合并，不同称呼但同一人只保留一个',
    ],
    negativePrompts: [
      '禁止遗漏有具体描写或台词的重要角色',
      '禁止 visualDescription 过于简略（少于20字）',
      '禁止将不同角色合并为一个',
      '禁止虚构原文没有的角色',
      '禁止角色性别、年龄与原文不符',
    ],
    tips: [
      '目标提取5-10个角色，根据剧本内容灵活调整',
      '即使只出现一次的重要配角也要提取',
      'visualDescription 是后续生成概念图和保证人物一致性的关键，必须详细',
      '角色类型：protagonist主角/supporting配角/antagonist反派/extra路人',
    ],
  },

  // ── 3. 场景提取 ──
  scene_extract: {
    stage: 'scene_extract',
    stageName: '场景提取',
    positivePrompts: [
      '提取所有有实际戏份的核心场景',
      'description 必须详细：空间布局、主要陈设道具、光线方向与氛围、天气、色调、声音环境',
      '按出场顺序排列',
      '同一地点不同时间/氛围可分为不同场景',
      '相似但有重要差异的场景不要合并',
    ],
    negativePrompts: [
      '禁止遗漏重要场景',
      '禁止 description 过于简略（少于30字）',
      '禁止将不同地点的场景合并',
      '禁止虚构剧本没有的场景',
      '禁止 timeOfDay 与剧本描述不符',
    ],
    tips: [
      '目标提取3-5个核心场景',
      '场景描述是后续生成场景参考图和保证场景一致性的关键',
      '时段：day白天/night夜晚/dawn黎明/dusk黄昏',
      '场景参考图生成后，该场景下所有关键帧都将以此为风格基准',
    ],
  },

  // ── 4. 分镜生成 ──
  shot_generation: {
    stage: 'shot_generation',
    stageName: '分镜生成',
    positivePrompts: [
      '严格遵循原著剧情，不修改、不删减核心情节、台词及旁白',
      '主画面描述按"主体+景别+视角+构图+氛围光感"撰写',
      '景别变化有节奏，避免连续相同景别',
      '对话用正反打，动作用中景+特写组合',
      '动作描述包含因果时序：先攻击后受击，不可颠倒',
      '前后镜头角色位置和状态连贯，服装发型一致',
      '每个镜头必须标注 subject（镜头主体）',
    ],
    negativePrompts: [
      '禁止镜头顺序与剧本逻辑混乱',
      '禁止遗漏关键情节或对话',
      '禁止动作时序颠倒（先受击后攻击）',
      '禁止连续3个以上相同景别',
      '禁止对话场景不用正反打',
      '禁止角色位置在连续镜头中突然变化（除非有移动动作描述）',
      '禁止 subject 与实际画面主体不符',
    ],
    tips: [
      '整集约3分钟，约60个镜头，单集约3秒一镜',
      'pace 字段自动映射 duration：fast=2s, normal=4s, slow=6s',
      '紧张场景用 fast 节奏，情感场景用 slow 节奏',
      '动作场景 cameraMovement 用 handheld 或 push_in，不可用 static',
      '光感氛围：悬疑用青灰/墨蓝冷色调，轻喜用米黄/暖橙暖色调',
      '输出 charactersInShot 字段，列出该镜头出现的角色名（用于人物一致性）',
    ],
  },

  // ── 5. 关键帧生成 ──
  keyframe: {
    stage: 'keyframe',
    stageName: '关键帧生成',
    positivePrompts: [
      '电影级写实风格，cinematic lighting，高细节，8k分辨率，统一色调',
      'ARRI Alexa，RED camera，cinematic color grading，film grain',
      '真实光影，global illumination，physically based rendering',
      '浅景深，bokeh，高清晰度，细节丰富，真实感强',
      '人物外貌严格遵循角色概念图：发型、服装、面部特征、体型完全一致',
      '场景环境严格遵循场景参考图：陈设、光线、色调完全一致',
    ],
    negativePrompts: [
      '低质量，模糊，变形，多余手指，丑陋，水印，文字',
      '卡通，动漫，3d渲染感，塑料皮肤，蜡像质感，恐怖谷',
      '过度光滑，AI伪影，数字绘画感，CG感，不自然对称',
      '完美皮肤，生成痕迹，人物变脸，服装错误，发型错误',
      '场景错误，光照不一致，阴影方向错误，透视错误',
      '背景闪烁，背景变形，家具移动，墙壁扭曲，物体复制',
    ],
    tips: [
      '必须传入角色概念图作为 referenceImages，保证人物一致性',
      '必须传入场景参考图作为 referenceImages，保证场景一致性',
      'prompt 中必须包含角色的 visualDescription（发型/服装/面部特征）',
      'prompt 中必须包含场景描述（地点/时段/氛围/光线）',
      '使用统一风格前缀，保证全片画风一致',
      '分辨率建议 2560x1440（16:9），与视频比例一致',
    ],
  },

  // ── 6. 配音生成 ──
  tts: {
    stage: 'tts',
    stageName: '配音生成',
    positivePrompts: [
      '按角色性别和类型分配不同音色',
      '女主角用清新女声，女反派用温柔女声（反差感）',
      '男主角用浑厚男声，男反派用小生男声（阴险感）',
      '对话语气符合角色性格和当前情绪',
      '语速自然，停顿合理，情感表达到位',
    ],
    negativePrompts: [
      '禁止所有角色使用相同音色',
      '禁止语气与角色性格不符（如反派用欢快语气）',
      '禁止语速过快或过慢',
      '禁止情感表达平淡（如悲伤场景用平静语气）',
      '禁止发音错误或断句错误',
      '禁止朗读角色名前缀（只朗读对话内容）',
    ],
    tips: [
      '解析对话格式"角色名：对话内容"，提取说话者分配音色',
      '去除角色名前缀，TTS只朗读对话内容',
      '豆包TTS常用音色：zh_female_qingxin(清新女声), zh_female_wener(温柔女声), zh_male_qianhou(浑厚男声), zh_male_xiaoshen(小生男声)',
      '配音时长应与视频时长匹配，必要时调整语速',
      '重要对话可适当放慢语速，增强情感表达',
    ],
  },

  // ── 7. 视频生成 ──
  video: {
    stage: 'video',
    stageName: '视频生成',
    positivePrompts: [
      '电影级画质，cinematic quality，8K，ultra-detailed，professional cinematography',
      'accurate physics，正确重力，自然惯性，真实碰撞反应，液体自然流动',
      '衣物自然摆动，头发自然飘动，真实光影，人体解剖正确，自然呼吸',
      '人物身份一致，角色外观一致，服装一致，发型发色一致',
      '场景一致，物体位置一致，光照方向一致，色彩基调一致',
      '前后镜头动作状态连贯，情绪连贯，时间线连贯',
    ],
    negativePrompts: [
      '多余手指，多余肢体，手指融合，手部畸形，面部扭曲，五官错位',
      '反重力，物体漂浮，液体逆流，无惯性运动，瞬间加速',
      '背景闪烁，背景变形，家具移动，光照不一致，阴影方向错误',
      '模糊，低分辨率，噪点，压缩痕迹，色带，锯齿，画面撕裂',
      '角色错位，换脸，角色不匹配，服装错误，发型错误',
      '塑料皮肤，蜡像质感，恐怖谷，过度光滑，AI伪影，CG感',
      '错误镜头角度，糟糕构图，平光，无景深，动作场景固定镜头',
    ],
    tips: [
      'motion prompt 必须包含景别、镜头运动、画面内容、风格四部分',
      'cameraMovement 转换为自然语言描述（如push_in→"镜头缓慢推近，聚焦主体"）',
      '使用首帧图片作为 reference_image，保证视频起始画面与关键帧一致',
      'Seedance 2.5 r2v模式 duration 只支持 5/10/11秒，其他值会自动修正',
      'generate_audio=true 可生成视频自带音频',
      '动作场景用 handheld/push_in，对话用 static/steadicam，情感用 slow push_in',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// 风格预设（扩充版）
// ═══════════════════════════════════════════════════════════════

const STYLE_PRESETS: StylePreset[] = [
  // ── 写实电影风（现代写实代表）──
  {
    id: 'cinematic-realistic',
    name: '电影写实风',
    category: '写实',
    description: '好莱坞电影级写实风格，ARRI Alexa摄影机，三点布光，浅景深，柯达胶片质感，专业色彩分级',
    visualStyle: '电影级写实风格，ARRI Alexa Mini LF摄影机，Master Anamorphic镜头，柯达Vision3 500T胶片模拟，film grain细腻颗粒，physically based rendering物理级渲染，global illumination全局光照，accurate skin subsurface scattering真实皮肤次表面散射，8K超高清，ultra-detailed极致细节，shallow depth of field f/1.4浅景深，creamy bokeh奶油般虚化，anamorphic lens flare变形镜头光晕，realistic atmospheric perspective真实大气透视',
    cameraLanguage: 'professional cinematography专业电影摄影，景别体系完整（大远景establishing shot/远景long shot/全景full shot/中景medium shot/近景medium close-up/特写close-up/大特写extreme close-up），镜头运动丰富（slow push-in缓慢推近聚焦情绪/pull-out拉远展现场景/pan横摇跟随动作/tilt垂直升降揭示/truck平行移动跟拍/crane升降宏大场面/steadicam稳定器长镜头/handheld手持纪实紧张感），镜头角度（eye-level平视/低角度仰拍英雄感/高角度俯拍无助感/dutch angle荷兰角紧张感/over-the-shoulder过肩对话），构图法则（rule of thirds三分法/symmetry对称/leading lines引导线/frame within a frame框架构图/golden ratio黄金比例）',
    colorPalette: 'cinematic color grading专业电影色彩分级，teal and orange青橙互补色（阴影偏青蓝teal，高光偏暖橙orange），accurate skin tone真实肤色，contrast curve S型对比度曲线，shadow lift阴影提升，highlight roll-off高光滚降，film emulation LUT胶片模拟LUT，color temperature 3200K-5600K色温，color harmony色彩和谐',
    rhythm: '三幕叙事节奏（第一幕建置setup/第二幕对抗confrontation/第三幕解决resolution），情绪曲线控制（平静build-up积累→张力tension上升→高潮climax爆发→回落resolution释放），动作场景快速剪辑（每镜1-3秒，匹配剪辑match cut，交叉剪辑cross-cutting），情感场景慢速长镜头（每镜5-10秒，缓慢推近slow push-in，留白silence），音乐卡点节奏（beat sync节拍同步，drop点剪辑），呼吸感pacing（快慢交替，张弛有度）',
    suitableFor: ['悬疑', '犯罪', '剧情', '动作', '现实主义', '现代都市'],
  },
  {
    id: 'documentary-realistic',
    name: '纪录片写实风',
    category: '写实',
    description: '纪录片风格，手持镜头，自然光，真实感强',
    visualStyle: '纪录片风格，handheld camera，自然光，真实质感，slight grain，高动态范围，真实色彩',
    cameraLanguage: '手持镜头，跟拍，长镜头，自然晃动，纪实感',
    colorPalette: '自然色彩，低饱和度，真实肤色，环境光',
    rhythm: '自然节奏，长镜头为主，少剪辑',
    suitableFor: ['纪录片', '传记', '现实主义', '社会题材'],
  },
  // ── 赛博朋克风（科幻代表）──
  {
    id: 'cyberpunk',
    name: '赛博朋克风',
    category: '科幻',
    description: '赛博朋克2077风格，雨夜霓虹，全息广告，义体改造，反乌托邦，蓝紫霓虹色调，体积光',
    visualStyle: '赛博朋克风格，Cyberpunk 2077 aesthetic，rainy night city雨夜都市，neon signs霓虹灯牌，holographic advertisements全息广告，futuristic architecture未来建筑，high tech low life高科技低生活，cybernetic implants义体改造，augmented reality增强现实，flying cars飞行汽车，megacorporation towers巨型企业塔，slums below下方贫民窟，volumetric lighting体积光，mist and fog雾气，reflections on wet ground湿地反射，neon glow霓虹辉光，chromatic aberration色差，anamorphic lens flare变形镜头光晕，film grain胶片颗粒，8K ultra-detailed超高清极致细节，ray tracing光线追踪，global illumination全局光照',
    cameraLanguage: 'dynamic cinematography动态摄影，低角度仰拍low-angle（展现建筑压迫感和英雄登场），荷兰角dutch angle（紧张不安感），快速推拉fast push-in（聚焦关键信息），手持跟拍handheld tracking（追逐场景紧张感），无人机航拍drone aerial（展现城市全貌），过肩镜头OTS（第一人称代入感），特写close-up（义体细节、霓虹反射在眼睛），大远景extreme wide（建立反乌托邦世界观），景别节奏（远景建立→中景叙事→特写情绪→大远景升华），构图（框架构图frame within a frame透过霓虹招牌/窗户/雨帘，引导线leading lines街道透视，对称构图symmetry建筑对称）',
    colorPalette: 'cyberpunk color grading赛博朋克色彩分级，互补色体系（主色cyan青蓝/#00f0ff + magenta品红/#ff00aa + yellow黄/#ffff00三原色霓虹），阴影偏深蓝紫deep blue-purple shadows，高光偏霓虹青neon cyan highlights，高对比度high contrast，色彩溢出color bleeding（霓虹光污染），色温2800K-6500K混合色温（暖黄钠灯+冷蓝霓虹+品红广告），饱和度高vibrant saturation，暗部偏蓝blue shadows，teal and magenta青品互补',
    rhythm: '电子音乐节奏electronic music pacing，快节奏剪辑fast-paced editing（动作场景每镜1-2秒，节拍卡点beat sync），慢动作slow motion（关键打斗、雨滴、玻璃破碎，bullet time子弹时间）， glitch效果转场（数字故障、画面撕裂、信号干扰），交叉剪辑cross-cutting（多条叙事线并行），build-up积累（从安静到混乱），高潮climax（视觉爆炸、霓虹全开），回落resolution（雨停、霓虹熄灭、寂静），呼吸感（高速追逐后接安静特写）',
    suitableFor: ['科幻', '赛博朋克', '动作', '悬疑', '未来题材', '反乌托邦'],
  },
  {
    id: 'space-sci-fi',
    name: '太空科幻风',
    category: '科幻',
    description: '太空科幻风格，星空，宇宙飞船，冷色调，宏大场面',
    visualStyle: '太空科幻风格，starfield，nebula，spacecraft，zero gravity，astronaut，cosmic scale，冷色调，volumetric light from stars，realistic space physics',
    cameraLanguage: '宏大远景，缓慢推拉，零重力运动，舱内跟拍',
    colorPalette: '深蓝/黑色主调，星光点缀，冷白光，金属质感',
    rhythm: '慢节奏，宏大场面，长镜头，史诗感',
    suitableFor: ['科幻', '太空', '冒险', '史诗'],
  },
  // ── 古风国风韵（国风代表）──
  {
    id: 'chinese-ancient',
    name: '古风国风韵',
    category: '国风',
    description: '中国古风电影级风格，水墨意境，唐宋建筑，汉服形制，黄金时刻，工笔细腻，东方美学',
    visualStyle: '中国古风电影级风格，Chinese ancient cinematic aesthetic，ink wash painting意境水墨，Tang/Song dynasty architecture唐宋建筑，hanfu costumes汉服形制（交领右衽/宽袖束腰/披帛），ancient palace宫殿，bamboo forest竹林，misty mountains远山如黛，lotus pond荷塘，paper lanterns纸灯笼，silk textures丝绸质感，golden hour黄金时刻光线，warm amber tones暖琥珀色调，volumetric light through leaves林间体积光，atmospheric perspective大气透视（远山淡影），8K ultra-detailed超高清，film grain胶片颗粒，shallow depth of field浅景深，anamorphic lens flare变形镜头光晕，accurate fabric simulation真实布料模拟（丝绸光泽/棉麻质感）',
    cameraLanguage: '东方美学摄影Oriental aesthetic cinematography，缓慢推拉slow push-in（聚焦人物情绪、器物细节），横移展示lateral tracking（展现场景全貌、建筑空间），升降镜头crane（从人物升到全景，意境升华），固定长镜头static long take（留白、意境、呼吸感），过肩镜头OTS（对话场景），特写close-up（眼神、手部动作、器物细节、衣袂飘动），大远景extreme wide（山水意境、人物渺小），景别节奏（大远景建立意境→全景展现场景→中景叙事→近景/特写情绪→大远景升华留白），构图（对称构图symmetry宫殿/庭院中轴线，留白negative space东方美学，框架构图frame within a frame透过门窗/月洞/竹林，引导线leading lines回廊/台阶/溪流，黄金比例golden ratio）',
    colorPalette: 'Chinese traditional color grading中国传统色彩分级，暖琥珀/金色主调warm amber/gold（黄金时刻、烛光、灯笼），朱红vermilion（宫墙、印章、嫁衣），墨绿ink green（竹林、山水、青铜器），石青azurite（远山、瓷器、服饰），牙白ivory（宣纸、丝绸、月光），低饱和度muted saturation（古画质感），sepia tone棕褐色调（怀旧感），color harmony色彩和谐（类似色analogous配色为主，点缀互补色），色温3200K-4500K暖色温，shadow lift阴影提升（暗部不死黑，保留细节），highlight roll-off高光滚降（柔和不刺眼）',
    rhythm: '东方叙事节奏Oriental narrative pacing，三幕结构（开端建置→中段冲突→结尾升华），诗意长镜头poetic long take（每镜5-15秒，留白、意境、呼吸感），慢动作slow motion（武打招式、衣袂飘动、花瓣飘落、水滴涟漪，bullet time子弹时间），快速剪辑fast editing（武打高潮、追逐场景，每镜1-3秒，匹配剪辑match cut），音乐卡点（古筝/琵琶/笛子节拍，鼓点剪辑），情绪曲线（平静→张力→高潮→回落→留白），呼吸感pacing（快慢交替，张弛有度，大量留白silence），转场（淡入淡出fade，叠化dissolve，匹配剪辑match cut，空镜转场scene transition via landscape）',
    suitableFor: ['古风', '武侠', '仙侠', '历史', '爱情', '宫廷'],
  },
  {
    id: 'wuxia-jianghu',
    name: '武侠江湖风',
    category: '国风',
    description: '武侠风格，江湖恩怨，飞檐走壁，刀剑光影，动感十足',
    visualStyle: '武侠风格，jianghu atmosphere，flying over rooftops，sword fight，martial arts，dynamic motion blur，dust particles，wind effects，ancient town，inn，bamboo forest fight',
    cameraLanguage: '快速跟拍，动作特写，低角度仰拍，旋转镜头，慢动作打击',
    colorPalette: '土黄/青灰主调，血红/剑光白点缀，高对比度，粗粝质感',
    rhythm: '快节奏，动作场景多，快速剪辑，慢动作高潮',
    suitableFor: ['武侠', '动作', '古装', '冒险'],
  },
  // ── 日系动漫风（动漫代表）──
  {
    id: 'anime-japanese',
    name: '日系动漫风',
    category: '动漫',
    description: '日本新番动漫风格，赛璐璐上色，京阿尼级作画，大眼睛表情，速度线，特效演出，鲜艳色彩',
    visualStyle: '日本新番动漫风格，Japanese modern anime aesthetic，Kyoto Animation级作画，cel shading赛璐璐上色，clean line art干净线稿，big expressive eyes大而有神的眼睛（高光反射/瞳孔细节），exaggerated facial expressions夸张表情（汗滴/青筋/爱心眼/阴影脸），vibrant colors鲜艳色彩，anime hair spikes动漫发型（呆毛/反光/飘动），school uniforms校服，cherry blossoms樱花，sunset夕阳，sparkle effects闪光特效，speed lines速度线，impact frames冲击帧（静止帧+背景线），chibi moments Q版瞬间（搞笑/卖萌），screen tone网点纸效果，glow effects辉光（眼睛/武器/能量），8K ultra-detailed超高清，anime background painting动漫背景画（细致场景）',
    cameraLanguage: 'anime cinematography动漫演出，夸张角度exaggerated angles（低角度仰拍英雄登场/高角度俯拍无助感/俯视大远景），快速推拉fast zoom in（情绪爆发、震惊瞬间，anime zoom），dutch angle荷兰角（紧张/混乱），360度环绕镜头360 rotation（变身/必杀技/告白），POV第一人称视角（代入感），过肩镜头OTS（对话），特写close-up（眼睛高光/表情变化/手部动作），大远景extreme wide（场景建立、世界观），景别节奏（远景建立→中景叙事→近景对话→特写情绪→冲击帧高潮），构图（三分法rule of thirds，中心构图center composition（主角光环），框架构图frame within a frame（窗户/门框），引导线leading lines，动态构图dynamic composition（倾斜/对角线））',
    colorPalette: 'anime color grading动漫色彩分级，高饱和度vibrant saturation，鲜艳色彩vibrant colors（主角发色/服装/眼睛），互补色配色complementary colors（蓝橙/红绿/紫黄），色温变化（日常场景暖黄5000K/战斗场景冷蓝7000K/回忆场景棕褐sepia），高光溢出highlight bloom（辉光效果），阴影清晰hard shadows（赛璐璐上色特点，明暗分界线清晰），色彩心理学（红色=热情/危险/爱情，蓝色=冷静/悲伤/科技，黄色=活力/希望，紫色=神秘/高贵），场景色调统一（每个场景有主色调，保证视觉一致性）',
    rhythm: 'anime pacing动漫节奏，三幕结构（日常建置→冲突升级→高潮解决），情绪爆发点emotional beat（OP/ED插入、变身、必杀技、告白、回忆杀），快速剪辑fast cutting（战斗/搞笑场景，每镜0.5-2秒，冲击帧impact frame静止0.5秒），慢速长镜头slow long take（情感/回忆/风景，每镜5-10秒），慢动作slow motion（必杀技/关键打击/花瓣飘落/眼泪滑落，bullet time），音乐卡点（OP/ED节拍同步，drop点剪辑，鼓点冲击帧），回忆杀flashback（棕褐色调/柔光/慢镜头，情感高潮），呼吸感（战斗高潮后接安静日常，张弛有度），转场（anime transition动漫转场：眼睛特写转场/物体匹配转场/画面分割/速度线划过/淡入淡出）',
    suitableFor: ['动漫', '青春', '喜剧', '冒险', '热血', '校园'],
  },
  {
    id: 'ghibli-style',
    name: '吉卜力治愈风',
    category: '动漫',
    description: '吉卜力工作室风格，手绘质感，自然风景，温暖治愈，柔和色彩',
    visualStyle: '吉卜力风格，Studio Ghibli inspired，hand-painted texture，lush nature，warm sunlight，soft clouds，cozy interiors，nostalgic atmosphere，gentle color palette，detailed backgrounds',
    cameraLanguage: '缓慢横移，自然风景长镜头，温暖特写，稳定构图',
    colorPalette: '柔和绿色/蓝色/暖黄，低饱和度，自然色彩，阳光感',
    rhythm: '慢节奏，治愈感，长镜头，自然流动',
    suitableFor: ['治愈', '日常', '奇幻', '自然', '家庭'],
  },
  // ── 暗黑哥特风 ──
  {
    id: 'dark-gothic',
    name: '暗黑哥特风',
    category: '暗黑',
    description: '哥特暗黑风格，古堡，乌鸦，十字架，冷灰紫色调，神秘压抑',
    visualStyle: '哥特暗黑风格，gothic architecture，dark castle，ravens，crosses，candles，fog，mysterious atmosphere，cold gray-purple tones，dramatic shadows，gargoyles，stained glass，victorian era',
    cameraLanguage: '低角度仰拍，阴影构图，缓慢推进，荷兰角，特写细节',
    colorPalette: '冷灰/深紫主调，暗红/惨白带血点缀，低亮度，高对比阴影',
    rhythm: '慢节奏，压抑感，长镜头，悬念 buildup',
    suitableFor: ['恐怖', '悬疑', '哥特', '吸血鬼', '暗黑奇幻'],
  },
  {
    id: 'noir-thriller',
    name: '黑色悬疑风',
    category: '暗黑',
    description: '黑色电影风格，雨夜，霓虹，阴影，侦探，高对比度黑白感',
    visualStyle: '黑色电影风格，film noir，rainy night city，neon reflections，deep shadows，detective，femme fatale，smoke，high contrast lighting，dutch angles，venetian blind shadows',
    cameraLanguage: '低角度，阴影构图，荷兰角，特写，烟雾光影',
    colorPalette: '高对比度，暗部死黑，亮部刺眼，少量霓虹色点缀，偏冷',
    rhythm: '中慢节奏，悬念感，长镜头 buildup，快速爆发',
    suitableFor: ['悬疑', '犯罪', '侦探', '黑色电影', '惊悚'],
  },
  // ── 清新治愈风 ──
  {
    id: 'fresh-healing',
    name: '清新治愈风',
    category: '治愈',
    description: '清新治愈风格，阳光，绿植，明亮，柔和，温暖人心',
    visualStyle: '清新治愈风格，fresh and healing，sunlight through leaves，green plants，bright airy，soft focus，warm pastels，cozy café，flower fields，gentle breeze，sparkling water，lens flare',
    cameraLanguage: '缓慢推拉，自然特写，明亮构图，稳定横移',
    colorPalette: '柔和粉/绿/黄，低饱和度，明亮通透，阳光感',
    rhythm: '慢节奏，治愈感，长镜头，自然流动',
    suitableFor: ['治愈', '日常', '爱情', '青春', '自然'],
  },
  // ── 蒸汽朋克风 ──
  {
    id: 'steampunk',
    name: '蒸汽朋克风',
    category: '科幻',
    description: '蒸汽朋克风格，齿轮，铜管，蒸汽机，维多利亚时代，暖棕金色调',
    visualStyle: '蒸汽朋克风格，steampunk，gears，brass pipes，steam engines，victorian era，airships，clockwork mechanisms，goggles，corsets，top hats，warm brass and copper tones，industrial revolution aesthetic',
    cameraLanguage: '机械特写，齿轮转动，低角度仰拍，缓慢推进',
    colorPalette: '暖棕/铜金主调，深褐/暗红点缀，金属质感，复古色调',
    rhythm: '中节奏，机械感，齿轮转动节奏，长镜头展示机械',
    suitableFor: ['蒸汽朋克', '科幻', '冒险', '维多利亚', '奇幻'],
  },
  // ── 末日废土风 ──
  {
    id: 'post-apocalyptic',
    name: '末日废土风',
    category: '暗黑',
    description: '末日废土风格，废墟，沙尘，残破建筑，生存，土黄灰绿色调',
    visualStyle: '末日废土风格，post-apocalyptic，ruins，dust storms，abandoned cities，broken buildings，survivors，wasteland，scavenged gear，rusted vehicles，barren landscape，hazy atmosphere',
    cameraLanguage: '宏大远景废墟，手持跟拍，低角度，沙尘光影',
    colorPalette: '土黄/灰绿主调，锈红/焦黑点缀，低饱和度，褪色感',
    rhythm: '中慢节奏，压抑感，长镜头展示废墟，快速生存动作',
    suitableFor: ['末日', '生存', '冒险', '废土', '动作'],
  },
  // ── 青春校园风 ──
  {
    id: 'youth-campus',
    name: '青春校园风',
    category: '青春',
    description: '青春校园风格，教室，操场，阳光，校服，明亮清新',
    visualStyle: '青春校园风格，youth campus，classroom，playground，sunlight，school uniforms，cherry blossoms，bicycle，lockers，blackboard，bright airy，soft focus，lens flare，nostalgic warmth',
    cameraLanguage: '明亮构图，缓慢推拉，青春特写，稳定横移',
    colorPalette: '明亮清新，暖黄/天蓝/粉白，低饱和度，阳光感',
    rhythm: '中节奏，青春感，轻快剪辑，情感长镜头',
    suitableFor: ['青春', '校园', '爱情', '成长', '日常'],
  },
];

// ═══════════════════════════════════════════════════════════════
// 导出函数
// ═══════════════════════════════════════════════════════════════

/**
 * 获取指定环节的提示词推荐
 */
export function getPromptRecommendation(stage: PipelineStage): PromptRecommendation {
  return PROMPT_RECOMMENDATIONS[stage];
}

/**
 * 获取所有环节的提示词推荐
 */
export function getAllPromptRecommendations(): PromptRecommendation[] {
  return Object.values(PROMPT_RECOMMENDATIONS);
}

/**
 * 获取所有风格预设
 */
export function getAllStylePresets(): StylePreset[] {
  return STYLE_PRESETS;
}

/**
 * 按分类获取风格预设
 */
export function getStylePresetsByCategory(category: string): StylePreset[] {
  return STYLE_PRESETS.filter(p => p.category === category);
}

/**
 * 获取所有风格分类
 */
export function getStyleCategories(): string[] {
  return [...new Set(STYLE_PRESETS.map(p => p.category))];
}

/**
 * 根据ID获取风格预设
 */
export function getStylePresetById(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find(p => p.id === id);
}

/**
 * 获取适用于指定场景的风格预设
 */
export function getStylePresetsForScene(scene: string): StylePreset[] {
  return STYLE_PRESETS.filter(p => p.suitableFor.some(s => scene.includes(s)));
}
