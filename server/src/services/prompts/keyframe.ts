// 关键帧/概念图提示词 — shuohao character-refs + novel-art 设计
// 核心策略：
//   1. 角色概念图 = 正面全身锚点图（纯白底、无手、标准姿势）
//   2. 角色四视图 = 参考锚点图生成（大头照/正面/90°侧面/背面）
//   3. 场景概念图 = 无人无手白底
//   4. 道具概念图 = 纯白底单一物品
//
// 锚点图是所有角色图像的一致性基准，四视图/细节图都必须参考锚点图

// ============ 通用关键帧提示词（首帧/尾帧） ============
export function buildKeyframePrompt(subject: string, styleDescription?: string): string {
  const style = styleDescription || '电影级画质，写实风格';
  return `${style}
${subject}
高清细节，电影级光影，构图严谨`;
}

// ============ 角色概念图（锚点图） ============
// shuohao character-refs 标准：正面全身、纯白底、双手自然下垂不拿东西、标准姿势
// 这张图是所有角色衍生图（四视图/细节图/表情图）的一致性基准
export function buildCharacterConceptPrompt(
  characterName: string,
  visualPrompt: string,
  styleDescription?: string,
): string {
  const style = styleDescription || '电影级画质，写实风格，超高清细节';
  return `${style}
角色概念锚点图：${characterName}
${visualPrompt}

【画面要求】
- 正面全身像，人物居中，双脚并拢或自然分开与肩同宽
- 双手自然下垂于身体两侧，不拿任何物品，手指自然伸直
- 表情自然，目光平视前方
- 纯白背景（#FFFFFF），无任何阴影、道具、装饰
- 画面只有一个人，绝对不能出现第二个人
- 鞋子清晰可见，全身完整入镜
- 标准解剖比例，无变形
- 高清细节，皮肤质感真实，服装纹理清晰`;
}

// ============ 角色四视图提示词 ============
// 必须传入角色概念图（锚点图）作为参考图，保证服装/发型/发色/面容一致
// 四视图 = 大头照 + 正面全身 + 90°侧面 + 背面
export function buildCharacterFourViewPrompt(
  characterName: string,
  visualPrompt: string,
  viewType: 'closeup' | 'front' | 'side' | 'back',
  styleDescription?: string,
): string {
  const style = styleDescription || '电影级画质，写实风格，超高清细节';
  const viewDesc: Record<string, string> = {
    closeup: '大头照（胸部以上），面部细节清晰，表情自然',
    front: '正面全身像，标准姿势，双手自然下垂',
    side: '90度侧面全身像，展示侧面轮廓和发型后侧',
    back: '背面全身像，展示后背发型和服装背面设计',
  };

  return `${style}
角色${viewType === 'closeup' ? '大头照' : viewType === 'front' ? '正面视图' : viewType === 'side' ? '侧面视图' : '背面视图'}：${characterName}
${visualPrompt}

【画面要求】
- ${viewDesc[viewType]}
- 纯白背景（#FFFFFF），无任何阴影、道具、装饰
- 画面只有一个人
- 严格保持与参考图（锚点图）一致的：面容、发型、发色、服装、体型、配饰
- 高清细节，服装纹理清晰`;
}

// ============ 角色细节图提示词 ============
// 参考锚点图生成特定部位的细节特写
export function buildCharacterDetailPrompt(
  characterName: string,
  detailType: 'hand' | 'costume' | 'accessory' | 'footwear' | 'face',
  visualPrompt: string,
  styleDescription?: string,
): string {
  const style = styleDescription || '电影级画质，写实风格，超高清细节';
  const detailDesc: Record<string, string> = {
    hand: '手部特写，展示手指形态、指甲、肤色、手部配饰（戒指/手表等）',
    costume: '服装细节特写，展示面料纹理、纽扣、缝线、图案',
    accessory: '标志性配饰特写，展示材质、细节、刻字',
    footwear: '鞋子特写，展示款式、材质、磨损程度',
    face: '面部特写，展示五官细节、皮肤质感、标志性特征（痣/疤等）',
  };

  return `${style}
角色细节图（${detailType}）：${characterName}
${visualPrompt}

【画面要求】
- ${detailDesc[detailType]}
- 纯白背景（#FFFFFF）或中性灰色背景
- 严格保持与参考图（锚点图）一致的特征
- 超高清细节，微距摄影质感`;
}

// ============ 场景概念图 ============
// shuohao novel-art 标准：无人、无手、白底/中性底，只有场景环境
export function buildSceneConceptPrompt(
  sceneName: string,
  visualPrompt: string,
  styleDescription?: string,
): string {
  const style = styleDescription || '电影级画质，写实风格，超高清细节';
  return `${style}
场景概念图：${sceneName}
${visualPrompt}

【画面要求】
- 纯场景环境，绝对不能出现人物、人影、人手
- 纯白或中性浅灰背景（场景独立展示，非实景合成）
- 均匀光照，清晰展示空间布局和所有物品
- 建筑结构透视准确，无变形
- 高清细节，材质纹理清晰
- 电影级光影氛围`;
}

// ============ 道具概念图 ============
// 纯白底、单一物品、无人物、无手、产品摄影风格
export function buildPropConceptPrompt(
  propName: string,
  visualPrompt: string,
  styleDescription?: string,
): string {
  const style = styleDescription || '电影级画质，写实风格，超高清细节';
  return `${style}
道具概念图：${propName}
${visualPrompt}

【画面要求】
- 单一物品居中展示，绝对不能出现人物、人手
- 纯白背景（#FFFFFF），无阴影或极淡投影
- 均匀柔光，产品摄影风格
- 物品全貌清晰，细节可见
- 高清细节，材质纹理真实`;
}

// ============ 负面提示词 ============
// 角色概念图负面提示词
export const CHARACTER_CONCEPT_NEGATIVE =
  '低质量，模糊，变形，多余手指，多余肢体，丑陋，水印，文字，卡通，动漫，3d渲染感，塑料皮肤，蜡像质感，恐怖谷，过度光滑，AI伪影，CG感，不自然对称，背景杂乱，多人，第二个人，侧脸，背影，手持物品，拿东西，手势，动作姿势，阴影，道具';

// 场景概念图负面提示词
export const SCENE_CONCEPT_NEGATIVE =
  '低质量，模糊，变形，丑陋，水印，文字，卡通，动漫，3d渲染感，塑料质感，过度光滑，AI伪影，CG感，人物，角色，人脸，人影，手，手指，不自然对称，透视错误，光照不一致，阴影错误，杂乱背景';

// 道具概念图负面提示词
export const PROP_CONCEPT_NEGATIVE =
  '低质量，模糊，变形，丑陋，水印，文字，卡通，动漫，3d渲染感，塑料质感，过度光滑，AI伪影，CG感，人物，角色，人脸，手，手指，背景杂乱，多物品，多个物体，手持';
