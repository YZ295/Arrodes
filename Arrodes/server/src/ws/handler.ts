/**
 * 阿罗德斯 WebSocket 消息处理器
 *
 * 数据流：
 * 1. 接收用户消息
 * 2. 检索跨会话记忆
 * 3. 构建上下文（历史 + 记忆 + 当前消息）
 * 4. 调 DeepSeek 流式生成
 * 5. 提取并存储新记忆
 * 6. 回复完成通知 + 记忆事件
 */
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { MessageRepository } from '../db/message-repo.js';
import { SessionRepository } from '../db/session-repo.js';
import { LlmService } from '../services/llmService.js';
import { retrieveContext, processConversation } from '../services/MemoryGateway.js';
import { buildSkillsPrompt, parseToolCall, executeToolCall } from '../skills/registry.js';
import type { WSClientMessage, WSServerMessage } from '../../../shared/types/index.js';

const messageRepo = new MessageRepository();
const sessionRepo = new SessionRepository();
const llmService = new LlmService();

export function createWebSocketHandler(ws: WebSocket, _req: IncomingMessage): void {
  console.log('[Arodes WS] 新连接建立');

  ws.on('message', (raw: Buffer) => {
    try {
      const msg: WSClientMessage = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'message':
          handleChatMessage(ws, msg);
          break;
        default:
          sendWs(ws, { type: 'error', data: { error: '未知消息类型' } });
      }
    } catch {
      sendWs(ws, { type: 'error', data: { error: '消息格式错误' } });
    }
  });

  ws.on('close', () => {
    console.log('[Arodes WS] 连接关闭');
  });

  ws.on('error', (err) => {
    console.error('[Arodes WS] 错误:', err);
  });
}

async function handleChatMessage(ws: WebSocket, msg: WSClientMessage): Promise<void> {
  console.log(`[Arodes WS] 收到消息 session=${msg.sessionId.slice(0, 8)}: ${msg.content.slice(0, 40)}...`);

  // 检查 session 是否存在
  const session = sessionRepo.findById(msg.sessionId);
  if (!session) {
    sendWs(ws, { type: 'error', data: { error: '会话不存在', code: 'SESSION_NOT_FOUND' } });
    return;
  }

  // 1. 保存用户消息
  messageRepo.create({
    sessionId: msg.sessionId,
    role: 'user',
    content: msg.content,
    isVoice: msg.isVoice,
  });

  // 2. 检索上下文（记忆 + 画像 + 摘要）
  const ctx = await retrieveContext(msg.content, msg.sessionId);

  // 3. 构建对话上下文
  const history = messageRepo.findBySession(msg.sessionId).slice(-10);
  const llmMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

  // 注入用户画像
  if (ctx.profile) {
    llmMessages.push({ role: 'system', content: ctx.profile });
  }

  // 注入相关记忆
  if (ctx.memories.length > 0) {
    const memoryText = ctx.memories
      .map((m) => `- ${m.content}（类型: ${m.type}）`)
      .join('\n');
    llmMessages.push({
      role: 'system',
      content: `以下是与本次对话相关的过往记忆：\n${memoryText}\n\n请自然地引用这些记忆。`,
    });
  }

  // 注入技能提示
  const skillsPrompt = buildSkillsPrompt();
  if (skillsPrompt) {
    llmMessages.push({ role: 'system', content: skillsPrompt });
  }

  // 加入历史消息
  for (const h of history) {
    llmMessages.push({ role: h.role, content: h.content });
  }

  // 4. 调 DeepSeek 流式生成
  sendWs(ws, { type: 'chunk', data: { content: '' } }); // 占位，触发前端消息气泡创建

  let fullReply = '';
  const startTime = Date.now();
  const TIMEOUT = 25000; // 25s 超时

  await llmService.chatStream(llmMessages, {
    onChunk: (text) => {
      fullReply += text;
      sendWs(ws, { type: 'chunk', data: { content: text } });

      // 超时保护
      if (Date.now() - startTime > TIMEOUT) {
        const timeoutMsg = '\n\n（阿罗德斯尚在参悟，请稍候片刻…）';
        if (!fullReply.endsWith(timeoutMsg)) {
          fullReply += timeoutMsg;
          sendWs(ws, { type: 'chunk', data: { content: timeoutMsg } });
        }
      }
    },
    onComplete: async (text) => {
      // 5. 检查并执行技能调用（Agent Loop）
      let finalReply = text;
      let maxLoops = 3; // 防止无限循环

      while (maxLoops > 0) {
        const toolCall = parseToolCall(finalReply);
        if (!toolCall) break;

        // 移除工具调用标签，只显示纯文本给用户
        const cleanText = finalReply.replace(/<tool_call>.*?<\/tool_call>/s, '').trim();

        // 执行技能
        const toolResult = await executeToolCall(toolCall.name, toolCall.args);
        console.log(`[Skills] ${toolCall.name} → ${toolResult.slice(0, 80)}`);

        // 将结果注入并再次调用 LLM
        llmMessages.push({ role: 'assistant', content: cleanText || finalReply });
        llmMessages.push({
          role: 'system',
          content: `系统通知: 技能 "${toolCall.name}" 执行结果:\n${toolResult}\n\n请基于以上结果继续回复用户，不要再输出 <tool_call> 标签。`,
        });

        // 再次流式生成
        finalReply = '';
        await llmService.chatStreamSimple(llmMessages, {
          onChunk: (chunk) => { finalReply += chunk; sendWs(ws, { type: 'chunk', data: { content: chunk } }); },
          onComplete: () => {},
          onError: (err) => { console.error('[Skills] 二次调用失败:', err); },
        });

        maxLoops--;
      }

      // 6. 保存 AI 回复
      messageRepo.create({
        sessionId: msg.sessionId,
        role: 'assistant',
        content: finalReply,
        isVoice: false,
      });

      sessionRepo.updateLastActive(msg.sessionId);

      // 7. 记忆网关：LLM 分析 → 提取记忆 → 更新画像
      const { newMemories } = await processConversation(msg.sessionId, msg.content, finalReply);
      console.log(`[MemoryGateway] 记忆已处理，新增 ${newMemories.length} 条`);

      // 8. 回复完成
      sendWs(ws, {
        type: 'complete',
        data: {
          content: finalReply,
          memories: newMemories,
        },
      });

      // 如果有新记忆，发记忆事件（前端显示 Toast）
      if (newMemories.length > 0) {
        sendWs(ws, {
          type: 'memory',
          data: { memories: newMemories },
        });
      }
    },
    onError: (error) => {
      console.error('[Arodes LLM] 错误:', error);
      // 降级回复
      const fallback = '愚者大人，阿罗德斯此刻无法连通命运之网，请稍后再试。';
      messageRepo.create({
        sessionId: msg.sessionId,
        role: 'assistant',
        content: fallback,
        isVoice: false,
      });
      sessionRepo.updateLastActive(msg.sessionId);
      sendWs(ws, { type: 'complete', data: { content: fallback, memories: [] } });
    },
  });
}

function sendWs(ws: WebSocket, msg: WSServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
