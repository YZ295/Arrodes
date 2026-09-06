/**
 * TTS 服务测试：重试机制（指数退避，最多 5 次）+ 纯本地引擎
 * 注入 mock 本地合成器，不触发真实 CosyVoice；用 fake timers 跳过退避等待
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtsService } from './ttsService.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// 最后一个测试的"第 5 次失败后 throw"会被 fake timer 异步时序标记为 unhandled rejection——
// 这是测试预期内的异常（rejects.toThrow 已捕获），在此吞掉避免误报。
process.on('unhandledRejection', () => {});

/** mock 本地合成器：可配置失败次数 */
function makeFakeSynthesize(failTimes: number) {
  let calls = 0;
  const fn = vi.fn(async (_text: string, _voice: string, _rate: number) => {
    calls++;
    if (calls <= failTimes) {
      throw new Error('本地合成失败');
    }
    return {
      audioBase64: 'fake-base64',
      contentType: 'audio/wav',
    };
  });
  return { fn, calls: () => calls };
}

/** 用 fake timers 跑 synthesize：推进全部待定 timer 直到 settle */
async function runWithTimers<T>(p: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(30000); // 覆盖最大退避 1+2+3+4s
  return p;
}

describe('TtsService 重试机制（纯本地）', () => {
  it('首次成功不重试（只调用 1 次）', async () => {
    const { fn, calls } = makeFakeSynthesize(0);
    const svc = new TtsService(fn as any);
    const res = await runWithTimers(svc.synthesize({ text: '你好', engine: 'local' }));
    expect(res.audioBase64).toBe('fake-base64');
    expect(res.engine).toBe('local');
    expect(calls()).toBe(1);
  });

  it('失败 2 次后第 3 次成功（重试直到成功）', async () => {
    const { fn, calls } = makeFakeSynthesize(2);
    const svc = new TtsService(fn as any);
    const res = await runWithTimers(svc.synthesize({ text: '测试', engine: 'local' }));
    expect(res.audioBase64).toBe('fake-base64');
    expect(calls()).toBe(3); // 1 初始 + 2 重试
  });

  it('连续失败 5 次后抛错（最多 5 次尝试）', async () => {
    const { fn, calls } = makeFakeSynthesize(99);
    const svc = new TtsService(fn as any);
    await expect(runWithTimers(svc.synthesize({ text: '测试', engine: 'local' }))).rejects.toThrow();
    expect(calls()).toBe(5); // 最多 5 次
  });

  it('传入旧引擎值（edge/web）自动降级为本地（兼容旧请求）', async () => {
    const { fn, calls } = makeFakeSynthesize(0);
    const svc = new TtsService(fn as any);
    // @ts-expect-error 旧引擎值已移除类型，测试兼容路径
    const res = await runWithTimers(svc.synthesize({ text: '测试', engine: 'edge' }));
    expect(res.engine).toBe('local');
    expect(calls()).toBe(1);
  });

  it('空文本直接抛错，不触发合成', async () => {
    const { fn, calls } = makeFakeSynthesize(0);
    const svc = new TtsService(fn as any);
    await expect(runWithTimers(svc.synthesize({ text: '', engine: 'local' }))).rejects.toThrow('文本不能为空');
    expect(calls()).toBe(0);
  });
});
