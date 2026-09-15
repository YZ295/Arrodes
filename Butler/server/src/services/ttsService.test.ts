/**
 * TTS 服务测试：重试机制（指数退避，最多 5 次）+ 纯本地引擎
 * 注入 mock 本地合成器，不触发真实 CosyVoice；用 fake timers 跳过退避等待
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtsService } from './ttsService.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

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
  // 在推进 fake timer 前立刻绑定拒绝处理器，避免第 5 次重试失败先成为未处理拒绝。
  const outcome = p.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(30000); // 覆盖最大退避 1+2+3+4s
  const result = await outcome;
  if ('error' in result) throw result.error;
  return result.value;
}

describe('TtsService 重试机制（纯本地）', () => {
  it('首次成功不重试（只调用 1 次）', async () => {
    const { fn, calls } = makeFakeSynthesize(0);
    const svc = new TtsService(fn as any);
    const res = await runWithTimers(svc.synthesize({ text: '你好', engine: 'local' }));
    expect(res.audioBase64).toBe('fake-base64');
    expect(res.engine).toBe('cosyvoice3');
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

  it.each(['cosyvoice2', 'edge', 'web', 'server'])('传入旧引擎值 %s 映射为 cosyvoice3', async (engine) => {
    const { fn, calls } = makeFakeSynthesize(0);
    const svc = new TtsService(fn as any);
    // @ts-expect-error 旧引擎值已移除类型，测试兼容路径
    const res = await runWithTimers(svc.synthesize({ text: '测试', engine }));
    expect(res.engine).toBe('cosyvoice3');
    expect(calls()).toBe(1);
  });

  it('空文本直接抛错，不触发合成', async () => {
    const { fn, calls } = makeFakeSynthesize(0);
    const svc = new TtsService(fn as any);
    await expect(runWithTimers(svc.synthesize({ text: '', engine: 'local' }))).rejects.toThrow('文本不能为空');
    expect(calls()).toBe(0);
  });

  it('provider 列表不再暴露 CosyVoice2，并将本地合成器登记为 CosyVoice3', () => {
    const cosyVoice3 = makeFakeSynthesize(0).fn;
    const svc = new TtsService(cosyVoice3 as any);

    expect(svc.getProviders()).toEqual([
      { id: 'cosyvoice3', name: 'Fun-CosyVoice3（当前本地）', configured: true },
      { id: 'audio8', name: 'Audio8（OpenAI 兼容）', configured: false },
    ]);
  });

  it('请求已取消时不进入合成器', async () => {
    const local = makeFakeSynthesize(0).fn;
    const svc = new TtsService(local as any);
    const controller = new AbortController();
    controller.abort();

    await expect(svc.synthesize(
      { text: '不要再说了', engine: 'cosyvoice3' },
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: 'AbortError' });
    expect(local).not.toHaveBeenCalled();
  });

  it('取消会中断退避等待，且不会继续重试', async () => {
    const local = makeFakeSynthesize(99).fn;
    const svc = new TtsService(local as any);
    const controller = new AbortController();
    const synthesis = svc.synthesize(
      { text: '停止重试', engine: 'cosyvoice3' },
      { signal: controller.signal },
    );
    const outcome = synthesis.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(30000);

    await expect(outcome).resolves.toMatchObject({ name: 'AbortError' });
    expect(local).toHaveBeenCalledOnce();
  });
});
