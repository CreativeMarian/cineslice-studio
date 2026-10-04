// 角色提取提示词 — shuohao novel-characters 设计
// 核心原则：每个角色输出三段式结构化描述
//   1. character_profile — 人物画像（性格/背景/动机/弧光）
//   2. visual_prompt     — 形象提示词（精确到发型/发色/服装/体型/标志特征，直接用于出图）
//   3. voice_prompt      — 音色提示词（年龄/音色/语速/情绪基调，直接对接 TTS）
//
// 质量门：主角必须有 visual_prompt 和 voice_prompt，且 visual_prompt 不少于 30 字

export interface CharacterExtractOutput {
  name: string;
  gender: 'male' | 'female' | 'other';
  role_type: 'protagonist' | 'supporting' | 'antagonist' | 'extra';
  character_profile: string;   // 人物画像：性格、背景、动机、人物弧光
  visual_prompt: string;       // 形象提示词：精确外貌描述，用于出图
  voice_prompt: string;        // 音色提示词：声音特征，用于 TTS
  identity_lock: {             // 身份锁：跨镜一致的关键特征（逐字输出，禁止二次描述）
    age: string;               // 年龄（如"28岁"）
    face_shape: string;        // 脸型（如"方脸"）
    hairstyle: string;         // 发型（如"黑色短发利落背头"）
    hair_color: string;        // 发色（如"黑色"）
    body_type: string;         // 体型（如"身高180cm，挺拔"）
    distinctive_features: string; // 标志特征（痣/疤/眼镜/配饰等，无则空字符串）
    prohibitions: string;      // 禁忌（绝不能改变的特征，如"左眉有疤""戴银耳钉"）
  };
  wardrobe: Array<{            // 服装列表（按场景列出）
    name: string;              // 服装名（如"日常装""职业装"）
    description: string;       // 服装详细描述（上装/下装/鞋子，具体颜色款式）
    color: string;             // 主色（如"深灰色"）
    scene_name: string;        // 适用场景名（剧本中场景名，无特定场景填"通用"）
  }>;
}

export function buildCharacterExtractPrompt(scriptContent: string): string {
  return `你是专业的影视角色设计师。从以下剧本中提取所有有台词或有重要动作的角色。

【输出要求】
对每个角色输出 JSON 对象，包含以下字段：

1. name — 角色名（剧本中使用的称呼）
2. gender — male / female / other
3. role_type — protagonist（主角）/ supporting（配角）/ antagonist（反派）/ extra（路人）
4. character_profile — 人物画像（80-150字）：
   - 年龄、身份、职业
   - 核心性格特征（2-3个关键词+解释）
   - 背景故事与动机
   - 在本剧中的人物弧光或功能定位
5. visual_prompt — 形象提示词（不少于30字，用于AI出图，必须具体）：
   - 脸型、五官特征
   - 发型（具体样式）、发色（具体颜色）
   - 服装（上装/下装/鞋子，具体颜色款式）
   - 体型（身高/胖瘦/体态）
   - 标志性特征（痣/疤/眼镜/配饰/纹身等）
   - 整体气质
   格式示例："28岁男性，方脸，浓眉大眼，黑色短发利落背头，穿深灰色西装白衬衫黑皮鞋，体型高大挺拔，左手戴银色机械表，气质沉稳冷峻"
6. voice_prompt — 音色提示词（用于TTS配音）：
   - 年龄段（青年/中年/老年）
   - 音色特质（低沉/清亮/沙哑/软糯/磁性等）
   - 语速偏好（偏快/适中/偏慢）
   - 常见情绪基调（冷静/激昂/温柔/暴躁等）
   格式示例："青年男性，低沉磁性嗓音，语速适中偏慢，情绪冷静克制，偶尔爆发时沙哑有力"
7. identity_lock — 身份锁（跨镜一致的关键特征，逐字输出、不可二次描述）：
   - age — 年龄（"28岁"）
   - face_shape — 脸型（"方脸"）
   - hairstyle — 发型（"黑色短发利落背头"）
   - hair_color — 发色（"黑色"）
   - body_type — 体型（"身高180cm，挺拔"）
   - distinctive_features — 标志特征（痣/疤/眼镜/配饰/纹身等，无则空字符串）
   - prohibitions — 禁忌（绝不能改变的特征，如"左眉有疤""戴银耳钉"）
   要求：必须与 visual_prompt 完全一致，只提取最稳定、最关键的特征，禁止空泛描述
8. wardrobe — 服装列表（按场景列出，1-5套）：
   - name — 服装名（"日常装""职业装""睡衣"等）
   - description — 详细描述（上装/下装/鞋子，具体颜色款式）
   - color — 主色
   - scene_name — 适用场景名（剧本中的场景名；若该服装多场景通用填"通用"）
   要求：服装变化按剧情场景推断，同一场景只给一套服装，主角必须至少1套

【重要规则】
- 只提取剧本中实际出现的角色，不要编造
- visual_prompt 必须具体到可以直接用于出图，禁止"英俊""美丽"等空泛描述
- 如果剧本中没有明确描述外貌，根据角色身份和性格合理推断，但要标注"推断"
- 路人/背景角色可以简化，但主角和配角必须完整
- 按出场顺序排列，主角在前

剧本内容：
${scriptContent}`;
}
