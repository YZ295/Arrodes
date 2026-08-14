/**
 * 开发 Agent（Agent 路由 v1 的 dev 分支）
 *
 * 岗位说明书：开发工作流专家——grill-me / to-spec / to-tickets / implement /
 * code-review / improve-architecture 等开发任务的专属执行者。
 * 由 Harness route() 按关键词分发进入（不走普通对话）。
 *
 * 与 main Agent 的区别：人设专注开发流程，提示词不含闲聊内容。
 */
import { AgentDefinition } from '../agent.js';
import { MessageRepository } from '../../db/message-repo.js';
import { SessionRepository } from '../../db/session-repo.js';
import { LlmService } from '../../services/llmService.js';
import { assembleModelMessages } from '../../services/modelHistory.js';
import { buildSkillsPrompt, parseToolCall, executeToolCall } from '../../skills/registry.js';

const messageRepo = new MessageRepository();
const sessionRepo = new SessionRepository();
const llmService = new LlmService();

const DEV_ROLE_PROMPT =
  '你是阿罗德斯的开发工作流 Agent，负责软件开发流程任务（方案审查/转规范/拆任务/实现/审查/架构优化）。' +
  '严格按步骤执行，调用对应开发技能（grill-me/to-spec/to-tickets/implement/code-review/improve-architecture）。' +
  '输出 <tool_call>{"name":"技能名","args":{}}</tool_call>，一次一个。';

export const devAgent: AgentDefinition = {
  id: 'dev',
  name: '开发 Agent',
  description: '开发工作流任务（方案审查/规范/拆任务/实现/审查/架构优化）',
  temperature: 0.4,
  maxTokens: 2048,

  run: async (ctx, input) => {
    const sessionId = ctx.sessionId;
    const skillsPrompt = buildSkillsPrompt();

    // 1. LLM 生成：技能提示 + 历史 + 用户请求（DEV_ROLE_PROMPT 由 chatStreamSimple 注入）
    const messages = assembleModelMessages({
      skillsPrompt,
      history: input.history,
      userMessage: input.content,
      maxHistory: 4,
    });

    let reply = '';
    let toolCount = 0;

    const runTurn = async () => {
      await llmService.chatStreamSimple(messages, {
        onChunk: (t) => {
          reply += t;
          input.onChunk?.(t);
        },
        onComplete: () => {},
        onError: (e) => { throw new Error(e); },
      }, DEV_ROLE_PROMPT);
    };

    await runTurn();

    // 2. 技能 Agent Loop（≤3 轮，与 main 一致）
    while (toolCount < 3) {
      const call = parseToolCall(reply);
      if (!call) break;
      toolCount++;
      const result = await executeToolCall(call.name, call.args);
      messages.push({ role: 'assistant' as const, content: reply });
      messages.push({ role: 'system' as const, content: `系统通知: 技能执行结果: ${result}` });
      reply = '';
      await runTurn();
    }

    // 3. 保存 AI 回复
    messageRepo.create({
      sessionId,
      role: 'assistant',
      content: reply,
      isVoice: false,
    });

    return { reply, newMemories: [] };
  },
};
