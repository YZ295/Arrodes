import type { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { WSClientMessage } from '../../../shared/types/index.js';

export function createWebSocketHandler(ws: WebSocket, _req: IncomingMessage): void {
  console.log('[WS] 新连接建立');

  ws.on('message', (raw: Buffer) => {
    try {
      const msg: WSClientMessage = JSON.parse(raw.toString());

      // TODO: 根据消息类型路由处理
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

  // 模拟分块回复
  const reply = `收到: "${msg.content}"（当前为占位回复，实际 AI 集成将在 Phase 1 完成）`;

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
