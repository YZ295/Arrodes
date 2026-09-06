/**
 * WebSocket 停止机制测试
 * 验证：cancel → 中止对应任务（abort）+ 回 stopped；无任务时幂等回 stopped
 * 不触发真实 LLM：直接测 handleCancel 纯函数 + activeTasks 注入
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { activeTasks, handleCancel } from './handler.js';

/** 假 WS：记录 send 消息 */
class FakeWebSocket {
  public sent: any[] = [];
  public readyState = 1;
  public OPEN = 1; // ws 库将 OPEN 挂在实例上，sendWs 检查 ws.readyState === ws.OPEN
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
}

describe('WebSocket 停止机制（handleCancel）', () => {
  beforeEach(() => {
    activeTasks.clear();
  });

  it('cancel 中止对应会话的任务（AbortController.abort 触发）', () => {
    const controller = new AbortController();
    let aborted = false;
    controller.signal.addEventListener('abort', () => { aborted = true; });
    activeTasks.set('sess-1', controller);

    const ws = new FakeWebSocket();
    handleCancel(ws as any, 'sess-1');

    expect(aborted).toBe(true);
    // 必须回 stopped 确认（前端清理 loading 态）
    const stopped = ws.sent.find((m) => m.type === 'stopped');
    expect(stopped).toBeTruthy();
    expect(stopped.data.sessionId).toBe('sess-1');
  });

  it('cancel 无活动任务时幂等回 stopped', () => {
    const ws = new FakeWebSocket();
    handleCancel(ws as any, 'nonexistent');
    const stopped = ws.sent.find((m) => m.type === 'stopped');
    expect(stopped).toBeTruthy();
  });

  it('cancel 只中止目标会话，不影响其他会话任务', () => {
    const other = new AbortController();
    let otherAborted = false;
    other.signal.addEventListener('abort', () => { otherAborted = true; });
    activeTasks.set('sess-A', other);

    const ws = new FakeWebSocket();
    handleCancel(ws as any, 'sess-B'); // 取消 B，A 不受影响
    expect(otherAborted).toBe(false);
  });
});
