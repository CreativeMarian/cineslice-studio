// 全自动流水线编排服务（门面）
// 实现已模块化拆分至 ./autoPipeline/ 目录：
//   types.ts     - AutoPipelineTask 类型
//   state.ts     - 模块级共享状态（tasks / scriptAnalysisCache，单一实例）
//   taskStore.ts - 任务生命周期（持久化/查询/取消/初始化）
//   helpers.ts   - 共享工具（模型选择/风格预设/剧本分析/导演上下文）
//   stages/      - 9 个阶段执行器
//   runner.ts    - 调度器（串行执行/启动/恢复）
//   index.ts     - AutoPipelineService 门面组装
export { AutoPipelineService } from './autoPipeline';
export type { AutoPipelineTask } from './autoPipeline';
