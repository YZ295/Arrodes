/**
 * MessageChannel 双重派发测试（回归锁定）
 *
 * 背景：llmStage 订阅 requestId 后，chunk/complete 被订阅者拦截导致
 * 全局 UI 回调（handleChunk/handleComplete）收不到 → "思考中"卡死。
 * 修复：订阅存在时 chunk/complete 仍继续走全局回调。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageChannel } from './MessageChannel.js';
import type { WSChunkData, WSCompleteData } from '@shared/types';

// 需要访问私有 handleMessage，通过实例方法触发
function makeChannel() {
  const channel = MessageChannel.getInstance();
  return { channel, handle: (msg: unknown) => (channel as any).handleMessage(msg) };
}

describe('MessageChannel 双重派发', () => {
  let subChunk: ReturnType<typeof vi.fn<(data: WSChunkData) => void>>;
  let subComplete: ReturnType<typeof vi.fn<(data: WSCompleteData) => void>>;
  let globalChunk: ReturnType<typeof vi.fn<(data: WSChunkData) => void>>;
  let globalComplete: ReturnType<typeof vi.fn<(data: WSCompleteData) => void>>;
  let m: ReturnType<typeof makeChannel>;

  beforeEach(() => {
    m = makeChannel();
    subChunk = vi.fn<(data: WSChunkData) => void>();
    subComplete = vi.fn<(data: WSCompleteData) => void>();
    globalChunk = vi.fn<(data: WSChunkData) => void>();
    globalComplete = vi.fn<(data: WSCompleteData) => void>();
    m.channel.setCallbacks({ onChunk: globalChunk, onComplete: globalComplete });
  });

  it('订阅存在时 chunk 同时派发给订阅者和全局（UI 实时渲染）', () => {
    m.channel.subscribe('req_1', { onChunk: subChunk });
    m.handle({ type: 'chunk', requestId: 'req_1', data: { content: '你好' } });
    expect(subChunk).toHaveBeenCalled();      // 管道收到
    expect(globalChunk).toHaveBeenCalled();   // UI 也收到（关键修复）
  });

  it('订阅存在时 complete 同时派发给订阅者和全局（UI 清 loading）', () => {
    m.channel.subscribe('req_1', { onComplete: subComplete });
    m.handle({ type: 'complete', requestId: 'req_1', data: { content: '完成' } });
    expect(subComplete).toHaveBeenCalled();
    expect(globalComplete).toHaveBeenCalled();
  });

  it('无订阅时走全局回调（兼容旧行为）', () => {
    m.handle({ type: 'chunk', data: { content: 'x' } });
    expect(globalChunk).toHaveBeenCalled();
  });

  it('stopped 只给订阅者（不触发全局）', () => {
    const subStopped = vi.fn();
    const globalStopped = vi.fn();
    m.channel.subscribe('req_1', { onStopped: subStopped });
    m.handle({ type: 'stopped', requestId: 'req_1' });
    expect(subStopped).toHaveBeenCalled();
    expect(globalStopped).not.toHaveBeenCalled();
  });
});
