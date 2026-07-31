/**
 * 语音管道阶段处理器
 *
 * 每个阶段返回 StageConfig，可被 PipelineRunner 组合执行。
 * 阶段职责单一，输入/输出类型明确。
 */
export { createIntentStage } from './intentStage';
export { createLlmStage } from './llmStage';
export { createTtsStage } from './ttsStage';
export { createMemoryStage } from './memoryStage';
