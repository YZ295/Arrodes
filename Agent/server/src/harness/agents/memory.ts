/**
 * 记忆 Agent
 *
 * 岗位说明书：对话后的记忆管家——分析对话、提取事实/偏好/事件/任务、维护用户画像。
 * 由 Harness afterTurn 自动调度（主对话完成后触发），失败不阻塞主流程。
 * 对应 Agent 开发基准：记忆系统（检索→注入→提取→画像）。
 */
import { AgentDefinition, AgentInput } from '../agent.js';
import { processConversation } from '../../services/MemoryGateway.js';

export const memoryAgent: AgentDefinition = {
  id: 'memory',
  name: '记忆 Agent',
  description: '对话后自动提取记忆、更新用户画像',
  temperature: 0.3, // 记忆分析要严谨，不瞎编
  maxTokens: 512,

  run: async (ctx, input: AgentInput) => {
    const userMessage = input.content;
    const aiReply = input.aiReply || '';

    const { newMemories } = await processConversation(ctx.sessionId, userMessage, aiReply);
    return { reply: '', newMemories };
  },
};
