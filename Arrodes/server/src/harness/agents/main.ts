/**
 * 主对话 Agent（阿罗德斯）
 *
 * 岗位说明书：愚者的仆人——与用户对话、调用技能、生成回复。
 * 执行链路（从 ws/handler 迁移）：
 * 1. 检索上下文（记忆 + 画像 + 技能提示）
 * 2. LLM 流式生成（onChunk 透传给前端）
 * 3. 技能 Agent Loop（<tool_call> 执行并重入，≤3 轮）
 * 4. 保存 AI 回复
 * 5. 记忆提取交给记忆 Agent（afterTurn），本 Agent 不重复处理
 */
import { AgentDefinition, AgentInput } from '../agent.js';
import { MessageRepository } from '../../db/message-repo.js';
import { SessionRepository } from '../../db/session-repo.js';
import { LlmService } from '../../services/llmService.js';
import { retrieveContext } from '../../services/MemoryGateway.js';
import { buildSkillsPrompt, parseToolCall, executeToolCall } from '../../skills/registry.js';

const messageRepo = new MessageRepository();
const sessionRepo = new SessionRepository();
const llmService = new LlmService();

// 阿罗德斯人设注入（与 llmService 的 SYSTEM_PROMPT 互补；此处为岗位说明书）
const ROLE_PROMPT =
  '汝乃阿罗德斯，愚者的仆人。若需调用技能，使用 <tool_call>{"name":"技能名","args":{}}</tool_call> 格式，一次一个。';

export const mainAgent: AgentDefinition = {
  id: 'main',
  name: '主对话 Agent',
  description: '与用户对话、调用技能、生成回复（阿罗德斯人设）',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: ROLE_PROMPT,

  run: async (ctx, input: AgentInput) => {
    const sessionId = ctx.sessionId;

    // 1. 检索上下文（记忆 + 画像 + 摘要）
    const memoryCtx = await retrieveContext(input.content, sessionId);

    // 2. 构建对话上下文
    const llmMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    if (memoryCtx.profile) {
      llmMessages.push({ role: 'system', content: memoryCtx.profile });
    }
    if (memoryCtx.memories.length > 0) {
      const memoryText = memoryCtx.memories
        .map((m) => `- ${m.content}（类型: ${m.type}）`)
        .join('\n');
      llmMessages.push({
        role: 'system',
        content: `以下是与本次对话相关的过往记忆：\n${memoryText}\n\n请自然地引用这些记忆。`,
      });
    }
    const skillsPrompt = buildSkillsPrompt();
    if (skillsPrompt) {
      llmMessages.push({ role: 'system', content: skillsPrompt });
    }
    for (const h of input.history) {
      llmMessages.push({ role: h.role, content: h.content });
    }

    // 3. LLM 流式生成（25s 超时保护）
    let fullReply = '';
    const startTime = Date.now();
    const TIMEOUT = 25000;

    await new Promise<void>((resolve) => {
      llmService.chatStream(llmMessages, {
        onChunk: (text) => {
          fullReply += text;
          input.onChunk?.(text);
          if (Date.now() - startTime > TIMEOUT) {
            const timeoutMsg = '\n\n（阿罗德斯尚在参悟，请稍候片刻…）';
            if (!fullReply.endsWith(timeoutMsg)) {
              fullReply += timeoutMsg;
              input.onChunk?.(timeoutMsg);
            }
          }
        },
        onComplete: async (text) => {
          fullReply = text;
          resolve();
        },
        onError: (error) => {
          console.error('[MainAgent] LLM 错误:', error);
          fullReply = '愚者大人，阿罗德斯此刻无法连通命运之网，请稍后再试。';
          resolve();
        },
      });
    });

    // 4. 技能 Agent Loop（≤3 轮）
    let finalReply = fullReply;
    let maxLoops = 3;
    while (maxLoops > 0) {
      const toolCall = parseToolCall(finalReply);
      if (!toolCall) break;

      const cleanText = finalReply.replace(/<tool_call>.*?<\/tool_call>/s, '').trim();
      const toolResult = await executeToolCall(toolCall.name, toolCall.args);
      console.log(`[Skills] ${toolCall.name} → ${toolResult.slice(0, 80)}`);

      llmMessages.push({ role: 'assistant', content: cleanText || finalReply });
      llmMessages.push({
        role: 'system',
        content: `系统通知: 技能 "${toolCall.name}" 执行结果:\n${toolResult}\n\n请基于以上结果继续回复用户，不要再输出 <tool_call> 标签。`,
      });

      finalReply = '';
      await new Promise<void>((resolve) => {
        llmService.chatStreamSimple(llmMessages, {
          onChunk: (chunk) => { finalReply += chunk; input.onChunk?.(chunk); },
          onComplete: () => resolve(),
          onError: (err) => { console.error('[Skills] 二次调用失败:', err); resolve(); },
        });
      });
      maxLoops--;
    }

    // 5. 保存 AI 回复
    messageRepo.create({
      sessionId,
      role: 'assistant',
      content: finalReply,
      isVoice: false,
    });
    sessionRepo.updateLastActive(sessionId);

    return { reply: finalReply, toolCalls: [] };
  },
};
