import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { MessageRepository } from '../db/message-repo.js';
import { SessionRepository } from '../db/session-repo.js';
import type { WSClientMessage } from '../../../shared/types/index.js';

const messageRepo = new MessageRepository();
const sessionRepo = new SessionRepository();

export function createWebSocketHandler(ws: WebSocket, _req: IncomingMessage): void {
  console.log('[WS] 新连接建立');

  ws.on('message', (raw: Buffer) => {
    try {
      const msg: WSClientMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'message':
          handleChatMessage(ws, msg);
          break;
        default:
          ws.send(JSON.stringify({ type: 'error', data: { error: '未知消息类型' } }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', data: { error: '消息格式错误' } }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] 连接关闭');
  });

  ws.on('error', (err) => {
    console.error('[WS] 错误:', err);
  });
}

async function handleChatMessage(ws: WebSocket, msg: WSClientMessage): Promise<void> {
  console.log(`[WS] 收到消息 session=${msg.sessionId}: ${msg.content.slice(0, 50)}...`);

  // 检查 session 是否存在
  const session = sessionRepo.findById(msg.sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', data: { error: '会话不存在', code: 'SESSION_NOT_FOUND' } }));
    return;
  }

  // 保存用户消息
  messageRepo.create({
    sessionId: msg.sessionId,
    role: 'user',
    content: msg.content,
    isVoice: msg.isVoice,
  });

  // TODO: Phase 1 - 集成 AI 回复生成，当前为占位回复
  const reply = `收到: "${msg.content}"（当前为占位回复，实际 AI 集成将在 Phase 1 完成）`;

  // 保存助手回复
  messageRepo.create({
    sessionId: msg.sessionId,
    role: 'assistant',
    content: reply,
    isVoice: false,
  });

  // 更新 session 的 lastActiveAt
  sessionRepo.updateLastActive(msg.sessionId);

  // 发送分块
  ws.send(JSON.stringify({ type: 'chunk', data: { content: reply } }));
  ws.send(JSON.stringify({
    type: 'complete',
    data: {
      content: reply,
      memories: [],
    },
  }));
}