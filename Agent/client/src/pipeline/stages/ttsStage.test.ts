import { describe, expect, it, vi } from 'vitest';
import { createTtsStage } from './ttsStage';

describe('TTS 阶段取消传播', () => {
  it('把管道 AbortSignal 传给 speak', async () => {
    const speak = vi.fn(async () => undefined);
    const signal = new AbortController().signal;
    const stage = createTtsStage({ speak });

    await stage.processor({
      context: {
        sessionId: 'session-1',
        startTime: Date.now(),
        state: { reply: '你好', generation: -1 },
        signal,
      },
    });

    expect(speak).toHaveBeenCalledWith('你好', signal);
  });

  it('进入阶段前已经取消时不再调用 speak', async () => {
    const speak = vi.fn(async () => undefined);
    const controller = new AbortController();
    controller.abort();
    const stage = createTtsStage({ speak });

    await stage.processor({
      context: {
        sessionId: 'session-1',
        startTime: Date.now(),
        state: { reply: '这句不应播放', generation: -1 },
        signal: controller.signal,
      },
    });

    expect(speak).not.toHaveBeenCalled();
  });
});
