// 阶段技能注册表（shuohao-skills，Apache-2.0，https://github.com/eternityspring/shuohao-skills）
// 将开源 AI 短剧制作 5 个 skill 的创作方法论分配到流水线各节点：
//   novel-outline    → episodes（剧集/剧本生成）
//   novel-script     → episodes（剧集/剧本生成）
//   novel-characters → characters（角色提取/概念图/造型）
//   novel-art        → scenes（场景/道具资产）
//   novel-storyboard → shots（分镜生成）+ keyframes（分镜图/关键帧）
// 完整 skill（SKILL.md + references + scripts 质量门）已随仓库落地在 ./vendor/，
// 零依赖 .mjs 质量门脚本可直接 node 运行（如 novel-script validate）。
// 本文件只负责把每个 skill 的核心方法论注入对应阶段的 systemPrompt。

export * from './gates';

export type StageSkillId = 'outline' | 'script' | 'characters' | 'art' | 'storyboard' | 'keyframe';

export type PipelineStage = 'episodes' | 'characters' | 'scenes' | 'shots' | 'keyframes';

interface StageSkillEntry {
  id: StageSkillId;
  name: string;          // 展示名（去重标记用）
  vendorDir: string;     // vendor 下对应 skill 目录名
  rules: string;         // 注入 systemPrompt 的规则文本
}

// ═══ 注册表 ═══
const STAGE_SKILLS: Record<StageSkillId, StageSkillEntry> = {
  outline: {
    id: 'outline',
    name: 'novel-outline 短剧改编大纲',
    vendorDir: 'novel-outline',
    rules: `【shuohao-skill:outline】短剧改编大纲规则（novel-outline，Apache-2.0）
1. 改编收敛：短剧只装得下一条主线+至多一条副线；功能重复的角色合成一张脸；砍掉的线要有理由。
2. 角色分档：主角组≤5人、重要配角≤10人、功能性角色≤10人；功能性角色用称呼标签（如"急诊医生"），无名背景人不进表。
3. 主场景上限：4+⌈集数/10⌉，夹在5–15；原著里只出现一次的场景要么砍掉、要么写复用方案（复用现有环境资产，换时段/天气改出变体）。
4. 爽点排布：先定大爆点落在哪几集，再拿小爽点填缝；相邻间隔≤3集、开头结尾无真空、大爆点不能压在最后一集；爽点类型跟着题材走（女频打脸和男频战神不是一种爽点）。
5. 叙事道具：判据=它坏了/丢了/被换掉，剧情会不会塌。会塌才收，上限8件；每件写承载功能与托起哪几个爽点；填不出function的一律不收（那是背景）。
6. 每集三栏缺一不可：synopsis（叙述体，禁止出现引号对白）、hook（钩子，让人点下一集的问题）、suspense（悬念，埋着没解的线）。
7. 爽点兑现：落在某集的爽点，该集梗概必须真的演出来（说第13集打脸，第13集梗概里就得有打脸）。
8. 生成难点预警：雨戏/肢体接触/人群/手部特写写进warnings，宁可多报；三人以上同框写crowdPlan拆解方案（机位怎么分、谁用背影和过肩带过）。
9. 关键取舍附原文逐字证据，不凭印象改编。`,
  },
  script: {
    id: 'script',
    name: 'novel-script 短剧剧本',
    vendorDir: 'novel-script',
    rules: `【shuohao-skill:script】短剧剧本写作规则（novel-script，Apache-2.0）
1. 时长预算先于一切：台词按4.5字/秒、动作按2.5秒/拍折算，写完自查秒数（±15%容差）；写超先砍动作节拍，写欠补冲突不补寒暄。
2. 单句台词≤35字、一口气说得完；长句拆成两句，中间插一拍动作或对方反应。
3. 谁的话像谁：按角色性情、身份、说话方式写台词——盖着名字也认得出是谁在说话。
4. 动作节拍一拍一件事、叙述体、动作要"常见"：挑担上船、搭手卸担、坐下、递东西、点头、回头、抱紧、站起来这类AI见过千万次的可写；伸篙一挡、睫毛颤、退了半寸这类精巧动作生成必崩，改写或删。戏剧信息靠常见动作的组合与时机给。动作里禁止出现引号台词。
5. 每场至少一个动作节拍：三句台词之间没有一个画面动作，观众就不知道在看什么。
6. 钩子不是标签是第一拍，而且要在运动中给：每集第1拍冷开场，钩子具象必须带主体运动（抱着皮箱在雾里跑，不是静物特写）；落在全集前3拍内；上一集结尾悬念要在开场接住。
7. 结尾最后一拍必须是悬念：一句没说完的话、一个没解释的动作、一声来历不明的响。
8. 认领的爽点要有戏扛：爆点是演出来的，不是梗概里说说。
9. 修改纪律：改一拍连读三拍（查人物位置/道具在手状态/谁在场）；改画面带声景。
10. 手感：台词短动作密（超四句连续对白就闷）；潜台词写进delivery不写破；VO一集两三条封顶；场次切换免费但观众注意力不是——两分钟内换四个景不如一个景里拧紧。`,
  },
  characters: {
    id: 'characters',
    name: 'novel-characters 角色设定',
    vendorDir: 'novel-characters',
    rules: `【shuohao-skill:characters】角色设定规则（novel-characters，Apache-2.0）
1. 一切基于原文观察；为设定可用而补全的部分要标注（推断）。
2. 证据（persona.evidence）只能放可引用原文，逐字照抄，不翻译不裁剪。
3. 出图提示词（image.prompt/image.sheet）绝对禁止出现角色名、别名、作者名、作品名——图像模型会画成它记忆里的角色；用描述交代这个人，不要叫他的名字。
4. 族裔、年代、地域必须从原文推断并明确写进提示词（East Asian, Han Chinese features, monolid eyes / early 20th century, Republican-era China / coarse indigo cotton tunic, southern Chinese river town），不写死会默认画当代西方白人。
5. 画风：Semi-realistic character illustration, painterly rendering with soft blended edges and visible brush texture, anatomically grounded；不要写"扁平矢量卡通"（会让模型跟自己拧巴）。
6. 真实感来自不完美：可见毛孔、肤色不匀、眼睑眉毛左右略不对称、发际线碎发、布料可见织纹与磨损；负面提示词不要禁photorealistic/3d render（自相矛盾），该禁的是塑料蜡质皮肤/过度磨皮/完全对称的脸/无高光的死眼/平板布料。
7. 同批角色长相声线要能区分开：个体描述段写脸型、五官比例、体态、衣着材质磨损、独有的细节；不要只写真实感样板（两角色雷同度>75%会被判为同一个人）。
8. 音色提示词是静态声音身份（给TTS音色设计引擎）：按〔年龄性别〕〔音色〕〔音区〕〔共鸣/支撑〕〔动态范围〕〔音量〕〔语速〕〔语调习惯〕〔口音〕〔默认情绪〕写成紧凑参数串（≤400字符）；禁止文学比喻、表演指导、条件分支、引号台词。`,
  },
  art: {
    id: 'art',
    name: 'novel-art 美术设定',
    vendorDir: 'novel-art',
    rules: `【shuohao-skill:art】场景美术设定规则（novel-art，Apache-2.0）
1. 场景是"要被生成几十次还得长一样"的环境资产，每个字段都在为一致性服务，不是实拍堪景。
2. 每个场景写3–5个一致性锚点：可画、可认、可核对（补丁船篷、断裂的第七块桥板、绿锈铜铃）；"陈旧的氛围"是形容词不是锚点。
3. 光照状态从分集反推：该场景出现的那些集里经历什么时段和天气就写什么状态，不写用不上的"白天/夜晚/黄昏"全家桶。
4. 场景提示词永远英文、永远空景：明写empty scene, no people；负面提示词必须禁人；绝不出现角色名/作者名/作品名。
5. 能做变体就别开新景：改时段、换天气、换前景、删道具，用variantOf挂到母场景上（桥板细节这类资产直接复用）；每多一个独立环境就多一份一致性维护。
6. 叙事道具判据：有特写、跨集出现、承载剧情的才收（通常3–8件）；每件写戏剧功能、状态变体（皮箱合上与打开是两张参考图）、尺度参照（防止手持道具被画成家具尺寸）、白底无手提示词（道具图要被贴进各种镜头，必须可抠）。
7. 环境真实感来自用旧的材质：掉漆、水渍、包浆、磨白的木纹；不要带角色的表面处理（毛孔/皮下散射是皮肤的事）。`,
  },
  storyboard: {
    id: 'storyboard',
    name: 'novel-storyboard 分镜',
    vendorDir: 'novel-storyboard',
    rules: `【shuohao-skill:storyboard】分镜规则（novel-storyboard，Apache-2.0）
1. 段=一次视频生成调用，≤15秒，不跨场次；先把节拍按剧情单元分组（一次交锋/一次进场/一次收尾），每组9–15秒就是一段。
2. 段内切分镜，每切2–5秒（硬门），围着3秒打；一段通常3–5切。
3. 每个分镜声明认领的节拍区间，全场连续不重不漏；台词秒数必须≤分镜秒数（4.4秒的台词就给5秒的切）。
4. 景别短语写进分镜图提示词；运镜用H3官方词表（Push In / Pan Left / Tracking Shot）写成自然英文动作，落在自己那一行。
5. 提示词禁角色名：用通用身份（an old ferryman / a young woman in a plain qipao），人名只许出现在台词里。
6. 导演手感：3秒一切是短剧的呼吸，节奏深浅相间长短相间；对话切正反打（问话给问话人近景，答话给答话人近景）；进场三件套第一切给运动主体（运动主体→大远景定场→关键局部特写）；关键动作独立成切（插入2秒特写）；重台词后切听者反应2–3秒；动接动（切点选在动作中间不选完成后）；段尾留钩；运镜克制（固定默认，一段不超两种）。
7. 参考图纪律：分镜图=提示词+参考图；场景设定图（该段场景+光照状态）必挂、画内每个角色设定图必挂、叙事道具设定图有就挂；提示词专心写构图、此刻的位置状态和姿态，长相材质交给参考图。`,
  },
  keyframe: {
    id: 'keyframe',
    name: 'novel-storyboard 分镜图',
    vendorDir: 'novel-storyboard',
    rules: `【shuohao-skill:keyframe】分镜图/关键帧规则（novel-storyboard frame，Apache-2.0）
1. 关键帧是静态定格：首帧=动作起点瞬间（姿势/位置/表情/道具处于动作开始前），尾帧=动作结束定格（与首帧有明显动作状态差异，如首帧举鞭欲抽、本帧鞭已抽下）。
2. 主分镜图钉0.00秒，是这一段世界观的完全参照；提示词先锚定参考图的构图与人物状态，再写细节。
3. 参考图是命根子：场景设定图（该段场景+光照状态）+ 画内角色设定图 + 涉及道具设定图全部挂上；提示词只负责取景、此刻的位置状态（已上船/在舱内/在桥头）和姿态，长相材质交给参考图。
4. 人物此刻的位置状态必须与参考图一致——图与文对不上，模型听图的，动作就乱。
5. 动作遵守常见动作原则：挑担上船、搭手卸担这类模型见过千万次的；精确物理交互、微表情不要写。
6. 风格统一：同剧关键帧画风不许漂（与角色/场景设定图同档）；画面无文字/字母/数字/logo/水印。`,
  },
};

/** 各流水线阶段命中的技能（顺序即注入顺序） */
const STAGE_TO_SKILL: Record<PipelineStage, StageSkillId[]> = {
  episodes: ['outline', 'script'],
  characters: ['characters'],
  scenes: ['art'],
  shots: ['storyboard'],
  keyframes: ['keyframe'],
};

/** 返回某阶段应注入的技能 id 列表 */
export function getStageSkillIds(stage: PipelineStage): StageSkillId[] {
  return STAGE_TO_SKILL[stage] || [];
}

/**
 * 将阶段技能规则追加到已有 systemPrompt（去重：同一技能只注入一次）。
 * 供各流水线阶段在提示词构造处调用，与 promptSkills.applySkillRules 叠加使用。
 */
export function applyStageRules(systemPrompt: string, stage: PipelineStage): string {
  let out = systemPrompt;
  for (const id of STAGE_TO_SKILL[stage] || []) {
    const entry = STAGE_SKILLS[id];
    const marker = `【shuohao-skill:${entry.id}】`;
    if (out.includes(marker)) continue; // 已注入过
    out = `${out}\n\n${entry.rules}`;
  }
  return out;
}

/** 查询某阶段技能规则（供测试/日志） */
export function getStageRuleText(stage: PipelineStage): string {
  return (STAGE_TO_SKILL[stage] || [])
    .map((id) => STAGE_SKILLS[id].rules)
    .join('\n\n');
}

/** 查询某技能的 vendor 目录绝对路径（质量门脚本可在此运行；dist 缺失时回退源码目录） */
export function getStageSkillVendorDir(id: StageSkillId): string {
  const fs = require('fs');
  const dist = require('path').join(__dirname, 'vendor', STAGE_SKILLS[id].vendorDir);
  if (fs.existsSync(dist)) return dist;
  // 开发/构建未拷贝 vendor 时回退 src（__dirname=server/dist/services/stageSkills → ../../.. = server）
  return require('path').join(__dirname, '..', '..', '..', 'src', 'services', 'stageSkills', 'vendor', STAGE_SKILLS[id].vendorDir);
}

/** 列出全部已注册阶段技能（供前端/日志展示） */
export function listStageSkills(): { id: StageSkillId; name: string; vendorDir: string }[] {
  return Object.values(STAGE_SKILLS).map(({ id, name, vendorDir }) => ({ id, name, vendorDir }));
}
