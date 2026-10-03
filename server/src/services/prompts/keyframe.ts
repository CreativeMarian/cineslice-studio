// 关键帧/概念图提示词 - 极简版
export function buildKeyframePrompt(subject: string, styleDescription?: string): string {
  const style = styleDescription || '电影级画质';
  return `${style}
${subject}
纯白背景，正面全身，高清细节`;
}

export function buildCharacterConceptPrompt(characterName: string, appearance: string, styleDescription?: string): string {
  const style = styleDescription || '电影级画质';
  return `${style}
角色概念图：${characterName}，${appearance}
纯白背景，正面全身，高清细节`;
}

export function buildSceneConceptPrompt(sceneName: string, environment: string, styleDescription?: string): string {
  const style = styleDescription || '电影级画质';
  return `${style}
场景概念图：${sceneName}，${environment}
高清细节，电影级光影`;
}
