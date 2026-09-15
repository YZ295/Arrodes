/**
 * 记忆存储阶段
 *
 * 服务端在 LLM 回复后自动处理记忆存储（通过 'memory' WS 消息）。
 * 此阶段作为管道标记点，记录记忆事件已触发。
 *
 * 非关键阶段：失败不影响管道结果。
 */
import type { StageConfig, StageInput, StageOutput } from '@shared/types/pipeline';
import type { MemoryNode } from '@shared/types';

export function createMemoryStage(): StageConfig<string, MemoryNode[]> {
  return {
    name: 'memory_save',
    timeout: 5000,
    continueOnError: true,

    processor: async (input: StageInput<string>): Promise<StageOutput<MemoryNode[]>> => {
      // 记忆由服务端通过 WS 'memory' 消息异步推送
      // 此阶段仅记录时间戳
      const memories = (input.context.state.newMemories as MemoryNode[]) || [];
      return { data: memories, continue: true, duration: 0 };
    },
  };
}
