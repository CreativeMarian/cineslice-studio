// 全局常量（创建后锁定的选项统一维护，避免多处散落不一致）
/** 视觉风格选项（创建后锁定） */
export const VISUAL_STYLES: string[] = ['3D漫剧', '写实', '古风', '赛博朋克', '日系动漫', '美式漫画'];
/** 画面比例选项（创建后锁定） */
export const ASPECT_RATIOS: string[] = ['16:9', '9:16'];

/** 剧本文本最大长度（与后端剧本字段上限保持一致，超长截断） */
export const SCRIPT_MAX_LENGTH = 200000;
/** 剧本文本接近上限的预警阈值（超过则提示压缩） */
export const SCRIPT_WARN_THRESHOLD = 180000;
/** 剧集标题最大长度 */
export const EPISODE_TITLE_MAX_LENGTH = 100;
/** 项目名称最大长度 */
export const PROJECT_NAME_MAX_LENGTH = 50;
/** 实体名称（角色/场景/道具等）最大长度 */
export const ENTITY_NAME_MAX_LENGTH = 30;
