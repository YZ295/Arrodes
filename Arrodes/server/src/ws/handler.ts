/**
 * 阿罗德斯 WebSocket 消息处理器（Harness 版）
 *
 * 数据流（多 Agent 编排）：
 * 1. 接收用户消息 → 保存
 * 2. Harness 执行主对话 Agent（检索记忆 → LLM 流式 → 技能 Agent Loop）
 * 3. Harness afterTurn 调度记忆 Agent（提取记忆、更新画像）
 * 4. 回复完成通知 + 记忆事件
 */
import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { MessageRepository } from '../db/message-repo.js';
import { SessionRepository } from '../db/session-repo.js';
import { harness } from '../harness/harness.js';
import { mainAgent } from '../harness/agents/main.js';
import { memoryAgent } from '../harness/agents/memory.js';
import type { WSClientMessage, WSServerMessage } from '../../../shared/types/index.js';

// 注册多 Agent（模块加载时）
harness.register(mainAgent);
harness.register(memoryAgent);

const messageRepo = new MessageRepository();
const sessionRepo = new SessionRepository();

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

  // 占位，触发前端消息气泡创建
  sendWs(ws, { type: 'chunk', data: { content: '' } });

  // 2. Harness 编排：主对话 Agent
  const ctx = { sessionId: msg.sessionId, state: {} };
  const result = await harness.execute('main', ctx, {
    content: msg.content,
    isVoice: msg.isVoice,
    history: messageRepo.findBySession(msg.sessionId).slice(-10),
    memories: [],
    onChunk: (text) => sendWs(ws, { type: 'chunk', data: { content: text } }),
  }, { retries: 0 });

  // 3. Harness afterTurn：记忆 Agent（对话后提取记忆/更新画像）
  const memoryResult = await harness.execute('memory', ctx, {
    content: msg.content,
    isVoice: msg.isVoice,
    history: [],
    memories: [],
    aiReply: result.reply,
  }, { retries: 0 });

  const newMemories = memoryResult.newMemories || [];

  // 4. 回复完成
  sendWs(ws, {
    type: 'complete',
    data: { content: result.reply, memories: newMemories },
  });

  // 5. 有新记忆 → 发记忆事件（前端 Toast）
  if (newMemories.length > 0) {
    sendWs(ws, {
      type: 'memory',
      data: { memories: newMemories },
    });
  }
}

function sendWs(ws: WebSocket, msg: WSServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
