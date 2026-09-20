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
import { LlmService, SYSTEM_PROMPT, mergeWithPromptShell } from '../../services/llmService.js';
import { formatLlmFailure } from '../../services/llmProvider.js';
import { getCurrentModel } from '../../services/modelRegistry.js';
import { retrieveContext } from '../../services/MemoryGateway.js';
import { assembleModelMessages } from '../../services/modelHistory.js';
import { buildSkillsPrompt, parseToolCall, executeToolCall } from '../../skills/registry.js';

const messageRepo = new MessageRepository();
const sessionRepo = new SessionRepository();
const llmService = new LlmService();

// 阿罗德斯人设注入（与 llmService 的 SYSTEM_PROMPT 互补；此处为岗位说明书）
const ROLE_PROMPT =
  '你是阿罗德斯，愚者的守灯人与谏臣。要调用技能时输出 <tool_call>{"name":"技能名","args":{}}</tool_call>，一次一个。';

/**
 * 桌宠会话人设——话少、务实的指导型助手（2026-09-09 用户需求）。
 * 仅对 title='桌宠对话' 的会话生效，不影响主窗口人设。
 */
export const PET_SYSTEM_PROMPT = [
  '你是阿罗德斯，桌宠形态的私人指导助手。',
  '',
  '【铁律：话少】',
  '- 默认沉默：不闲聊、不主动搭话、不复述、不客套、不加总结。',
  '- 每次回复最多两句，直接给结论。一句话能说清就不用两句。',
  '- 不用称呼、不解释你做了什么、不用表情和列表。',
  '',
  '【四种任务（对号入座，其他请求一律最简回答）】',
  '1. 代码纠错：用户贴代码或报错 → 第一句「错在<位置>：<原因>」，第二句「改法：…」。没错就说「这段没问题」。',
  '2. 学习辅助：',
  '   - 用户说「保存知识点：<名称>：<内容>」→ 调 knowledge_save，然后只回「已存：<名称>」。',
  '   - 用户问某个概念 → 先调 knowledge_query 查已存内容：查到就用大白话 ≤3 句解释；查不到就直接简答，不确定就说不确定。',
  '   - 用户问「存过哪些」→ 调 knowledge_query（keyword 留空）列名称。',
  '3. 游戏指引：用户报当前游戏进度 → 一句「下一步做什么」，需要理由附半句。',
  '4. 麻将对局：用户报手牌+已打出的牌 → 一句「打 X」或「防守，拆 Y」，附半句理由（听牌/危险张/牌效率）。',
  '',
  '【禁止】长篇解释、分点列表（除知识点列举）、客套话、主动建议无关事项。',
].join('\n');

export const mainAgent: AgentDefinition = {
  id: 'main',
  name: '主对话 Agent',
  description: '与用户对话、调用技能、生成回复（阿罗德斯人设）',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: ROLE_PROMPT,

  run: async (ctx, input: AgentInput) => {
    const sessionId = ctx.sessionId;

    // 0. 会话识别：桌宠会话（title='桌宠对话'）→ 指导型人设；其余走主人设
    const session = sessionRepo.findById(sessionId);
    const isPetChat = session?.title === '桌宠对话';
    const persona = isPetChat ? PET_SYSTEM_PROMPT : undefined;

    // 1. 检索上下文（记忆 + 画像 + 摘要）
    const memoryCtx = await retrieveContext(input.content, sessionId);

    // 2. 从会话日志投影模型消息（画像 + 记忆 + 技能 + 历史）
    const llmMessages = assembleModelMessages({
      profile: memoryCtx.profile,
      memories: memoryCtx.memories,
      skillsPrompt: buildSkillsPrompt(),
      visualContext: input.visualContext,
      history: input.history,
    });

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
          // 用户主动停止 → 静默结束，不拼接错误文案
          if (error === 'stopped' || input.signal?.aborted) {
            console.log('[MainAgent] 已按用户指令停止');
            resolve();
            return;
          }
          console.error('[MainAgent] LLM 错误:', error);
          fullReply = formatLlmFailure(getCurrentModel().provider, error);
          resolve();
        },
      }, input.signal, persona ? { systemPrompt: persona } : undefined);
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
        }, mergeWithPromptShell(persona ?? SYSTEM_PROMPT));
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
