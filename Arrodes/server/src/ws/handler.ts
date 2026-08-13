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
import { devAgent } from '../harness/agents/dev.js';
import { updatePetTask, updatePetResult } from '../services/petStatus.js';
import { handleExplicitMemory } from '../services/explicitMemory.js';
import { actionGate, matchConfirmIntent } from '../services/actionGate.js';
import { executeToolCall } from '../skills/registry.js';
import type { WSClientMessage, WSServerMessage } from '../../../shared/types/index.js';

// 注册多 Agent（模块加载时）
harness.register(mainAgent);
harness.register(memoryAgent);
harness.register(devAgent);

const messageRepo = new MessageRepository();
const sessionRepo = new SessionRepository();

// 每个连接维护「进行中的对话任务」→ AbortController（用于 cancel 中断）
// 导出：测试可注入自定义 Map
export const activeTasks = new Map<string, AbortController>();

export function createWebSocketHandler(ws: WebSocket, _req: IncomingMessage): void {
  console.log('[Arodes WS] 新连接建立');

  ws.on('message', (raw: Buffer) => {
    try {
      const msg: WSClientMessage = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'message':
          handleChatMessage(ws, msg);
          break;
        case 'cancel':
          // 停止：中断当前会话的 LLM 推理（不保存结果、不回复）
          handleCancel(ws, msg.sessionId, activeTasks, msg.requestId);
          break;
        default:
          sendWs(ws, { type: 'error', data: { error: '未知消息类型' }, requestId: msg.requestId });
      }
    } catch {
      sendWs(ws, { type: 'error', data: { error: '消息格式错误' } });
    }
  });

  ws.on('close', () => {
    console.log('[Arodes WS] 连接关闭');
    // 连接断开 → 清理该连接的所有活动任务
    for (const controller of activeTasks.values()) {
      controller.abort();
    }
    activeTasks.clear();
  });

  ws.on('error', (err) => {
    console.error('[Arodes WS] 错误:', err);
  });
}

/** 处理 cancel：中止指定会话正在进行的 LLM 流式推理（导出供测试） */
export function handleCancel(
  ws: WebSocket,
  sessionId: string,
  tasks: Map<string, AbortController> = activeTasks,
  requestId?: string,
): void {
  const controller = tasks.get(sessionId);
  if (controller) {
    controller.abort();
    console.log(`[Arodes WS] 已中止会话 ${sessionId.slice(0, 8)} 的推理任务`);
  } else {
    console.log(`[Arodes WS] 会话 ${sessionId.slice(0, 8)} 无活动任务，无需中止`);
  }
  // 服务端确认停止（前端据此清理 loading 态；回带请求标识）
  sendWs(ws, { type: 'stopped', data: { sessionId }, requestId });
}

async function handleChatMessage(ws: WebSocket, msg: WSClientMessage): Promise<void> {
  console.log(`[Arodes WS] 收到消息 session=${msg.sessionId.slice(0, 8)}: ${msg.content.slice(0, 40)}...`);

  // 事件回带请求标识（方案 A：客户端按 id 认领，并发不串线）
  const send = (m: Omit<WSServerMessage, 'requestId'>) => {
    sendWs(ws, { ...m, requestId: msg.requestId });
  };

  // 检查 session 是否存在
  const session = sessionRepo.findById(msg.sessionId);
  if (!session) {
    send({ type: 'error', data: { error: '会话不存在', code: 'SESSION_NOT_FOUND' } });
    return;
  }

  // 1. 保存用户消息
  messageRepo.create({
    sessionId: msg.sessionId,
    role: 'user',
    content: msg.content,
    isVoice: msg.isVoice,
  });

  // 桌宠状态：记录当前任务
  updatePetTask(msg.content.slice(0, 50));

  // 占位，触发前端消息气泡创建
  send({ type: 'chunk', data: { content: '' } });

  // 1.5 显式记忆指令（借鉴 HoloJarvis："记住X"/"忘了X" 直接读写记忆，不走 LLM）
  const explicit = handleExplicitMemory(msg.sessionId, msg.content);
  if (explicit.handled) {
    updatePetResult(explicit.reply || '');
    send({ type: 'complete', data: { content: explicit.reply || '已处理', memories: [] } });
    activeTasks.delete(msg.sessionId);
    return;
  }

  // 1.6 桌面操作确认/取消（D3=A：高风险操作短句确认，不经 LLM，防误听）
  const pendingAction = actionGate.getLatest();
  const confirmIntent = pendingAction ? matchConfirmIntent(msg.content) : null;
  if (pendingAction && confirmIntent) {
    if (confirmIntent === 'confirm') {
      const item = actionGate.confirm(pendingAction.id);
      const result = item?.executor
        ? await item.executor(item.args)
        : await executeToolCall(item!.skill, item!.args);
      updatePetResult(result);
      send({ type: 'complete', data: { content: `已执行：${result}`, memories: [] } });
    } else {
      actionGate.deny(pendingAction.id);
      send({ type: 'complete', data: { content: '已取消该操作。', memories: [] } });
    }
    activeTasks.delete(msg.sessionId);
    return;
  }

  // 为该会话创建可取消任务（同会话新消息会覆盖旧 controller → 旧任务自然失效）
  const controller = new AbortController();
  activeTasks.set(msg.sessionId, controller);
  const signal = controller.signal;

  // 2. Harness 编排：按意图路由到对应 Agent（开发任务→dev，记忆管理→memory，其余→main）
  const ctx = { sessionId: msg.sessionId, state: {} };
  const routedAgent = harness.route(msg.content);
  const result = await harness.execute(routedAgent, ctx, {
    content: msg.content,
    isVoice: msg.isVoice,
    history: messageRepo.findBySession(msg.sessionId).slice(-10),
    memories: [],
    onChunk: (text) => {
      if (!signal.aborted) send({ type: 'chunk', data: { content: text } });
    },
    signal, // 透传取消信号给主 Agent（LLM 流式中断）
  }, { retries: 0 });

  // 已取消：不发 complete、不调度记忆 Agent（用户不想听，也不该继续干活）
  if (signal.aborted) {
    console.log(`[Arodes WS] 会话 ${msg.sessionId.slice(0, 8)} 已取消，跳过后续流程`);
    activeTasks.delete(msg.sessionId);
    return;
  }

  // 3. Harness afterTurn：记忆 Agent（对话后提取记忆/更新画像）
  const memoryResult = await harness.execute('memory', ctx, {
    content: msg.content,
    isVoice: msg.isVoice,
    history: [],
    memories: [],
    aiReply: result.reply,
  }, { retries: 0 });

  const newMemories = memoryResult.newMemories || [];

  // 桌宠状态：记录最近完成任务结果
  updatePetResult(result.reply);

  // 4. 回复完成（回带请求标识）
  send({
    type: 'complete',
    data: { content: result.reply, memories: newMemories },
  });

  // 5. 有新记忆 → 发记忆事件（前端 Toast）
  if (newMemories.length > 0) {
    send({
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
