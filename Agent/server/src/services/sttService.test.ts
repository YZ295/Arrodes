import { describe, it, expect } from 'vitest';
import { transcribeAudio, isSttMode, type SttMode } from './sttService.js';

function fakeFetch(
  handler: (url: string, init: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<Record<string, unknown>>;
    text: () => Promise<string>;
  }>,
): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;
}

const okResp = (body: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => '',
});

const errResp = (status: number, body: Record<string, unknown>) => ({
  ok: false,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const buffer = Buffer.alloc(8);

describe('sttService 模式路由（D2=C 混合策略）', () => {
  const baseDeps = {
    localUrl: 'http://127.0.0.1:12002',
    siliconflowBaseUrl: 'https://api.siliconflow.cn',
    siliconflowApiKey: 'test-key',
  };

  it('online 模式走 SiliconFlow', async () => {
    let called = '';
    const deps = {
      ...baseDeps,
      fetchFn: fakeFetch(async (url) => {
        called = url;
        return okResp({ text: '你好' });
      }),
    };
    const r = await transcribeAudio('online', buffer, 'a.webm', 'audio/webm', deps);
    expect(r.engine).toBe('online');
    expect(called).toContain('siliconflow');
    expect(r.text).toBe('你好');
  });

  it('local 模式走本地侧车', async () => {
    let called = '';
    const deps = {
      ...baseDeps,
      fetchFn: fakeFetch(async (url) => {
        called = url;
        return okResp({ text: '本地识别' });
      }),
    };
    const r = await transcribeAudio('local', buffer, 'a.webm', 'audio/webm', deps);
    expect(r.engine).toBe('local');
    expect(called).toContain('12002');
  });

  it('local 模式侧车不可用时抛错（不回退在线）', async () => {
    const deps = {
      ...baseDeps,
      fetchFn: fakeFetch(async () => errResp(503, { error: 'model missing' })),
    };
    await expect(transcribeAudio('local', buffer, 'a.webm', 'audio/webm', deps)).rejects.toThrow();
  });

  it('auto 模式本地失败自动回退在线', async () => {
    const calls: string[] = [];
    const deps = {
      ...baseDeps,
      fetchFn: fakeFetch(async (url) => {
        calls.push(url);
        return url.includes('12002') ? errResp(500, {}) : okResp({ text: '回退成功' });
      }),
    };
    const r = await transcribeAudio('auto', buffer, 'a.webm', 'audio/webm', deps);
    expect(r.engine).toBe('online');
    expect(r.usedFallback).toBe(true);
    expect(calls.length).toBe(2);
  });

  it('auto 模式本地可用直接用本地', async () => {
    const deps = {
      ...baseDeps,
      fetchFn: fakeFetch(async (url) =>
        url.includes('12002') ? okResp({ text: '本地' }) : okResp({ text: '在线' }),
      ),
    };
    const r = await transcribeAudio('auto', buffer, 'a.webm', 'audio/webm', deps);
    expect(r.engine).toBe('local');
  });

  it('isSttMode 校验合法模式', () => {
    expect(isSttMode('online')).toBe(true);
    expect(isSttMode('local')).toBe(true);
    expect(isSttMode('auto')).toBe(true);
    expect(isSttMode('bogus')).toBe(false);
  });

  it('非法模式默认按 online 处理', async () => {
    let called = '';
    const deps = {
      ...baseDeps,
      fetchFn: fakeFetch(async (url) => {
        called = url;
        return okResp({ text: 'x' });
      }),
    };
    const r = await transcribeAudio('bogus' as SttMode, buffer, 'a.webm', 'audio/webm', deps);
    expect(r.engine).toBe('online');
    expect(called).toContain('siliconflow');
  });
});
