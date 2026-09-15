/**
 * 语音代际计数器
 *
 * 解决「旧消息的 TTS 在新消息后仍在播放」的问题：
 * - 每次发送新消息 → bumpGeneration() 递增
 * - 管道运行前捕获当前代际，存入 ctx.state.generation
 * - TTS 阶段播放前检查：若 ctx 代际 < 当前代际 → 该消息已被新消息取代，跳过播放
 */
let currentGeneration = 0;

/** 获取当前代际 */
export function getVoiceGeneration(): number {
  return currentGeneration;
}

/** 递增代际（新消息/打断时调用） */
export function bumpVoiceGeneration(): number {
  currentGeneration++;
  return currentGeneration;
}

/** 重置（可选，用于测试） */
export function resetVoiceGeneration(): void {
  currentGeneration = 0;
}
