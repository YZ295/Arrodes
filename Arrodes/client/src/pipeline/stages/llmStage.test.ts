/**
 * llmStage 测试：requestId 订阅机制（方案 A）
 * 验证：发送带 requestId、abort 触发 cancel + reject('cancelled')、complete 正常 resolve
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLlmStage } from './llmStage.js';
import type { StageInput } from '@shared/types/pipeline';

// ===== Mock MessageChannel =====
const mockSubscribe = vi.fn();
const mockSend = vi.fn();
const mockNextRequestId = vi.fn(() => 'req_test_1');
const mockIsConnected = vi.fn(() => true);

vi.mock('../../core/MessageChannel', () => ({
  MessageChannel: {
    getInstance: () => ({
      subscribe: mockSubscribe,
      send: mockSend,
      nextRequestId: mockNextRequestId,
      isConnected: mockIsConnected,
    }),
  },
}));

import { MessageChannel } from '../../core/MessageChannel';

function makeInput(overrides?: Partial<StageInput['context']>): StageInput<string> {
  return {
    context: {
      sessionId: 'sess-1',
      startTime: Date.now(),
      state: {},
      rawInput: '你好',
      ...overrides,
    },
    previousOutput: undefined,
  } as unknown as StageInput<string>;
}

describe('llmStage requestId 订阅', () => {
  let capturedSub: Parameters<typeof mockSubscribe>[1] | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSub = null;
    mockSubscribe.mockImplementation((_id: string, sub: any) => {
      capturedSub = sub;
      return () => {};
    });
  });

  it('发送消息时携带 requestId', async () => {
    const stage = createLlmStage();
    const p = stage.processor(makeInput());
    await Promise.resolve(); // 让 send 执行
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'message',
      requestId: 'req_test_1',
      sessionId: 'sess-1',
    }));
    // 清理：触发 complete 结束 promise
    capturedSub?.onComplete?.({ content: '回复' });
    await p;
  });

  it('complete 事件 resolve 管道阶段', async () => {
    const stage = createLlmStage();
    const p = stage.processor(makeInput());
    await Promise.resolve();
    capturedSub?.onComplete?.({ content: '完整回复' });
    const result = await p;
    expect((result.data as any).content).toBe('完整回复');
    expect(result.continue).toBe(true);
  });

  it('abort 信号触发 cancel 发送 + reject(cancelled)', async () => {
    const stage = createLlmStage();
    const controller = new AbortController();
    const p = stage.processor(makeInput({ signal: controller.signal }));
    await Promise.resolve();
    // 触发 abort
    controller.abort();
    await expect(p).rejects.toThrow('cancelled');
    // 必须发 cancel 且带同 requestId
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cancel',
      requestId: 'req_test_1',
    }));
  });

  it('stopped 事件（服务端确认停止）视同取消', async () => {
    const stage = createLlmStage();
    const p = stage.processor(makeInput());
    await Promise.resolve();
    capturedSub?.onStopped?.();
    await expect(p).rejects.toThrow('cancelled');
  });

  it('错误事件 reject 并带错误信息', async () => {
    const stage = createLlmStage();
    const p = stage.processor(makeInput());
    await Promise.resolve();
    capturedSub?.onError?.('LLM 服务不可用');
    await expect(p).rejects.toThrow('LLM 服务不可用');
  });
});
