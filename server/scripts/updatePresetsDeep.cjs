// 更新数据库中4个常用风格预设的深度优化参数
// 直接将优化后的参数写入数据库

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'moo-director.db');
const db = new Database(dbPath);

// 4个优化后的预设参数
const optimizedPresets = [
  {
    id: 'builtin_cinematic-realistic',
    name: '电影写实风',
    category: '写实',
    description: '好莱坞电影级写实风格，ARRI Alexa摄影机，三点布光，浅景深，柯达胶片质感，专业色彩分级',
    visual_style: '电影级写实风格，ARRI Alexa Mini LF摄影机，Master Anamorphic镜头，柯达Vision3 500T胶片模拟，film grain细腻颗粒，physically based rendering物理级渲染，global illumination全局光照，accurate skin subsurface scattering真实皮肤次表面散射，8K超高清，ultra-detailed极致细节，shallow depth of field f/1.4浅景深，creamy bokeh奶油般虚化，anamorphic lens flare变形镜头光晕，realistic atmospheric perspective真实大气透视',
    camera_language: 'professional cinematography专业电影摄影，景别体系完整（大远景establishing shot/远景long shot/全景full shot/中景medium shot/近景medium close-up/特写close-up/大特写extreme close-up），镜头运动丰富（slow push-in缓慢推近聚焦情绪/pull-out拉远展现场景/pan横摇跟随动作/tilt垂直升降揭示/truck平行移动跟拍/crane升降宏大场面/steadicam稳定器长镜头/handheld手持纪实紧张感），镜头角度（eye-level平视/低角度仰拍英雄感/高角度俯拍无助感/dutch angle荷兰角紧张感/over-the-shoulder过肩对话），构图法则（rule of thirds三分法/symmetry对称/leading lines引导线/frame within a frame框架构图/golden ratio黄金比例）',
    color_palette: 'cinematic color grading专业电影色彩分级，teal and orange青橙互补色（阴影偏青蓝teal，高光偏暖橙orange），accurate skin tone真实肤色，contrast curve S型对比度曲线，shadow lift阴影提升，highlight roll-off高光滚降，film emulation LUT胶片模拟LUT，color temperature 3200K-5600K色温，color harmony色彩和谐',
    shot_rhythm: '三幕叙事节奏（第一幕建置setup/第二幕对抗confrontation/第三幕解决resolution），情绪曲线控制（平静build-up积累→张力tension上升→高潮climax爆发→回落resolution释放），动作场景快速剪辑（每镜1-3秒，匹配剪辑match cut，交叉剪辑cross-cutting），情感场景慢速长镜头（每镜5-10秒，缓慢推近slow push-in，留白silence），音乐卡点节奏（beat sync节拍同步，drop点剪辑），呼吸感pacing（快慢交替，张弛有度）',
    video_params: JSON.stringify({ suitableFor: ['悬疑', '犯罪', '剧情', '动作', '现实主义', '现代都市'] }),
  },
  {
    id: 'builtin_cyberpunk',
    name: '赛博朋克风',
    category: '科幻',
    description: '赛博朋克2077风格，雨夜霓虹，全息广告，义体改造，反乌托邦，蓝紫霓虹色调，体积光',
    visual_style: '赛博朋克风格，Cyberpunk 2077 aesthetic，rainy night city雨夜都市，neon signs霓虹灯牌，holographic advertisements全息广告，futuristic architecture未来建筑，high tech low life高科技低生活，cybernetic implants义体改造，augmented reality增强现实，flying cars飞行汽车，megacorporation towers巨型企业塔，slums below下方贫民窟，volumetric lighting体积光，mist and fog雾气，reflections on wet ground湿地反射，neon glow霓虹辉光，chromatic aberration色差，anamorphic lens flare变形镜头光晕，film grain胶片颗粒，8K ultra-detailed超高清极致细节，ray tracing光线追踪，global illumination全局光照',
    camera_language: 'dynamic cinematography动态摄影，低角度仰拍low-angle（展现建筑压迫感和英雄登场），荷兰角dutch angle（紧张不安感），快速推拉fast push-in（聚焦关键信息），手持跟拍handheld tracking（追逐场景紧张感），无人机航拍drone aerial（展现城市全貌），过肩镜头OTS（第一人称代入感），特写close-up（义体细节、霓虹反射在眼睛），大远景extreme wide（建立反乌托邦世界观），景别节奏（远景建立→中景叙事→特写情绪→大远景升华），构图（框架构图frame within a frame透过霓虹招牌/窗户/雨帘，引导线leading lines街道透视，对称构图symmetry建筑对称）',
    color_palette: 'cyberpunk color grading赛博朋克色彩分级，互补色体系（主色cyan青蓝/#00f0ff + magenta品红/#ff00aa + yellow黄/#ffff00三原色霓虹），阴影偏深蓝紫deep blue-purple shadows，高光偏霓虹青neon cyan highlights，高对比度high contrast，色彩溢出color bleeding（霓虹光污染），色温2800K-6500K混合色温（暖黄钠灯+冷蓝霓虹+品红广告），饱和度高vibrant saturation，暗部偏蓝blue shadows，teal and magenta青品互补',
    shot_rhythm: '电子音乐节奏electronic music pacing，快节奏剪辑fast-paced editing（动作场景每镜1-2秒，节拍卡点beat sync），慢动作slow motion（关键打斗、雨滴、玻璃破碎，bullet time子弹时间），glitch效果转场（数字故障、画面撕裂、信号干扰），交叉剪辑cross-cutting（多条叙事线并行），build-up积累（从安静到混乱），高潮climax（视觉爆炸、霓虹全开），回落resolution（雨停、霓虹熄灭、寂静），呼吸感（高速追逐后接安静特写）',
    video_params: JSON.stringify({ suitableFor: ['科幻', '赛博朋克', '动作', '悬疑', '未来题材', '反乌托邦'] }),
  },
  {
    id: 'builtin_chinese-ancient',
    name: '古风国风韵',
    category: '国风',
    description: '中国古风电影级风格，水墨意境，唐宋建筑，汉服形制，黄金时刻，工笔细腻，东方美学',
    visual_style: '中国古风电影级风格，Chinese ancient cinematic aesthetic，ink wash painting意境水墨，Tang/Song dynasty architecture唐宋建筑，hanfu costumes汉服形制（交领右衽/宽袖束腰/披帛），ancient palace宫殿，bamboo forest竹林，misty mountains远山如黛，lotus pond荷塘，paper lanterns纸灯笼，silk textures丝绸质感，golden hour黄金时刻光线，warm amber tones暖琥珀色调，volumetric light through leaves林间体积光，atmospheric perspective大气透视（远山淡影），8K ultra-detailed超高清，film grain胶片颗粒，shallow depth of field浅景深，anamorphic lens flare变形镜头光晕，accurate fabric simulation真实布料模拟（丝绸光泽/棉麻质感）',
    camera_language: '东方美学摄影Oriental aesthetic cinematography，缓慢推拉slow push-in（聚焦人物情绪、器物细节），横移展示lateral tracking（展现场景全貌、建筑空间），升降镜头crane（从人物升到全景，意境升华），固定长镜头static long take（留白、意境、呼吸感），过肩镜头OTS（对话场景），特写close-up（眼神、手部动作、器物细节、衣袂飘动），大远景extreme wide（山水意境、人物渺小），景别节奏（大远景建立意境→全景展现场景→中景叙事→近景/特写情绪→大远景升华留白），构图（对称构图symmetry宫殿/庭院中轴线，留白negative space东方美学，框架构图frame within a frame透过门窗/月洞/竹林，引导线leading lines回廊/台阶/溪流，黄金比例golden ratio）',
    color_palette: 'Chinese traditional color grading中国传统色彩分级，暖琥珀/金色主调warm amber/gold（黄金时刻、烛光、灯笼），朱红vermilion（宫墙、印章、嫁衣），墨绿ink green（竹林、山水、青铜器），石青azurite（远山、瓷器、服饰），牙白ivory（宣纸、丝绸、月光），低饱和度muted saturation（古画质感），sepia tone棕褐色调（怀旧感），color harmony色彩和谐（类似色analogous配色为主，点缀互补色），色温3200K-4500K暖色温，shadow lift阴影提升（暗部不死黑，保留细节），highlight roll-off高光滚降（柔和不刺眼）',
    shot_rhythm: '东方叙事节奏Oriental narrative pacing，三幕结构（开端建置→中段冲突→结尾升华），诗意长镜头poetic long take（每镜5-15秒，留白、意境、呼吸感），慢动作slow motion（武打招式、衣袂飘动、花瓣飘落、水滴涟漪，bullet time子弹时间），快速剪辑fast editing（武打高潮、追逐场景，每镜1-3秒，匹配剪辑match cut），音乐卡点（古筝/琵琶/笛子节拍，鼓点剪辑），情绪曲线（平静→张力→高潮→回落→留白），呼吸感pacing（快慢交替，张弛有度，大量留白silence），转场（淡入淡出fade，叠化dissolve，匹配剪辑match cut，空镜转场scene transition via landscape）',
    video_params: JSON.stringify({ suitableFor: ['古风', '武侠', '仙侠', '历史', '爱情', '宫廷'] }),
  },
  {
    id: 'builtin_anime-japanese',
    name: '日系动漫风',
    category: '动漫',
    description: '日本新番动漫风格，赛璐璐上色，京阿尼级作画，大眼睛表情，速度线，特效演出，鲜艳色彩',
    visual_style: '日本新番动漫风格，Japanese modern anime aesthetic，Kyoto Animation级作画，cel shading赛璐璐上色，clean line art干净线稿，big expressive eyes大而有神的眼睛（高光反射/瞳孔细节），exaggerated facial expressions夸张表情（汗滴/青筋/爱心眼/阴影脸），vibrant colors鲜艳色彩，anime hair spikes动漫发型（呆毛/反光/飘动），school uniforms校服，cherry blossoms樱花，sunset夕阳，sparkle effects闪光特效，speed lines速度线，impact frames冲击帧（静止帧+背景线），chibi moments Q版瞬间（搞笑/卖萌），screen tone网点纸效果，glow effects辉光（眼睛/武器/能量），8K ultra-detailed超高清，anime background painting动漫背景画（细致场景）',
    camera_language: 'anime cinematography动漫演出，夸张角度exaggerated angles（低角度仰拍英雄登场/高角度俯拍无助感/俯视大远景），快速推拉fast zoom in（情绪爆发、震惊瞬间，anime zoom），dutch angle荷兰角（紧张/混乱），360度环绕镜头360 rotation（变身/必杀技/告白），POV第一人称视角（代入感），过肩镜头OTS（对话），特写close-up（眼睛高光/表情变化/手部动作），大远景extreme wide（场景建立、世界观），景别节奏（远景建立→中景叙事→近景对话→特写情绪→冲击帧高潮），构图（三分法rule of thirds，中心构图center composition（主角光环），框架构图frame within a frame（窗户/门框），引导线leading lines，动态构图dynamic composition（倾斜/对角线））',
    color_palette: 'anime color grading动漫色彩分级，高饱和度vibrant saturation，鲜艳色彩vibrant colors（主角发色/服装/眼睛），互补色配色complementary colors（蓝橙/红绿/紫黄），色温变化（日常场景暖黄5000K/战斗场景冷蓝7000K/回忆场景棕褐sepia），高光溢出highlight bloom（辉光效果），阴影清晰hard shadows（赛璐璐上色特点，明暗分界线清晰），色彩心理学（红色=热情/危险/爱情，蓝色=冷静/悲伤/科技，黄色=活力/希望，紫色=神秘/高贵），场景色调统一（每个场景有主色调，保证视觉一致性）',
    shot_rhythm: 'anime pacing动漫节奏，三幕结构（日常建置→冲突升级→高潮解决），情绪爆发点emotional beat（OP/ED插入、变身、必杀技、告白、回忆杀），快速剪辑fast cutting（战斗/搞笑场景，每镜0.5-2秒，冲击帧impact frame静止0.5秒），慢速长镜头slow long take（情感/回忆/风景，每镜5-10秒），慢动作slow motion（必杀技/关键打击/花瓣飘落/眼泪滑落，bullet time），音乐卡点（OP/ED节拍同步，drop点剪辑，鼓点冲击帧），回忆杀flashback（棕褐色调/柔光/慢镜头，情感高潮），呼吸感（战斗高潮后接安静日常，张弛有度），转场（anime transition动漫转场：眼睛特写转场/物体匹配转场/画面分割/速度线划过/淡入淡出）',
    video_params: JSON.stringify({ suitableFor: ['动漫', '青春', '喜剧', '冒险', '热血', '校园'] }),
  },
];

console.log('开始更新4个常用风格预设的深度优化参数...\n');

const updateStmt = db.prepare(`
  UPDATE style_presets
  SET name = ?, category = ?, description = ?, visual_style = ?, camera_language = ?, color_palette = ?, shot_rhythm = ?, video_params = ?, updated_at = ?
  WHERE id = ?
`);

let updated = 0;
for (const preset of optimizedPresets) {
  const existing = db.prepare('SELECT id, name FROM style_presets WHERE id = ?').get(preset.id);
  if (!existing) {
    console.log(`  跳过 ${preset.id}（不存在）`);
    continue;
  }

  updateStmt.run(
    preset.name,
    preset.category,
    preset.description,
    preset.visual_style,
    preset.camera_language,
    preset.color_palette,
    preset.shot_rhythm,
    preset.video_params,
    new Date().toISOString(),
    preset.id
  );

  console.log(`  ✅ 已更新: ${preset.name} (${preset.id})`);
  console.log(`     visual_style 长度: ${preset.visual_style.length} 字符`);
  console.log(`     camera_language 长度: ${preset.camera_language.length} 字符`);
  console.log(`     color_palette 长度: ${preset.color_palette.length} 字符`);
  console.log(`     shot_rhythm 长度: ${preset.shot_rhythm.length} 字符`);
  updated++;
}

console.log(`\n完成！更新了 ${updated}/4 个常用风格预设`);

// 统计最终分类
console.log('\n=== 最终风格预设统计 ===');
const allPresets = db.prepare('SELECT category, COUNT(*) as cnt FROM style_presets GROUP BY category ORDER BY cnt DESC').all();
for (const cat of allPresets) {
  console.log(`  ${cat.category}: ${cat.cnt} 个`);
}
const total = db.prepare('SELECT COUNT(*) as cnt FROM style_presets').get();
console.log(`  总计: ${total.cnt} 个`);

db.close();
