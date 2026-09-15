// @vitest-environment jsdom
/**
 * ButlerPanel 前端测试：状态展示 + 启停按钮错误处理（最小覆盖）
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ButlerPanel } from './ButlerPanel';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function installFetch(routes: Record<string, (url: string) => Response | Promise<Response>>): FetchMock {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.includes(prefix)) return handler(url);
    }
    return jsonResponse(404, { error: `no route for ${url}` });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const RUNNING_STATUS = {
  engine: { running: true, pid: 4321, source: 'managed', managed: true, startedAt: '2026-09-08T22:00:00+08:00' },
  state: { summarizing: true, queue: 2, current: { date: '20260908', start: '22:00', end: '22:10' }, updatedAt: '2026-09-08T22:40:00+08:00', stale: false },
};

describe('ButlerPanel 状态展示', () => {
  it('引擎运行中：显示运行状态与停止按钮', async () => {
    installFetch({
      '/api/v1/butler/status': () => jsonResponse(200, RUNNING_STATUS),
      '/api/v1/butler/records/recent': () => jsonResponse(200, { records: [{ ts: '2026-09-08T22:39:00+08:00', status: 'raw' }] }),
      '/api/v1/butler/summary/dates': () => jsonResponse(200, { dates: ['20260908'] }),
    });
    await act(async () => root.render(<ButlerPanel />));
    await act(async () => {});
    expect(container.textContent).toContain('运行中');
    expect(container.querySelector('[data-role="butler-stop"]')).not.toBeNull();
  });

  it('引擎停止但 state 陈旧且 summarizing → 显示异常', async () => {
    installFetch({
      '/api/v1/butler/status': () => jsonResponse(200, {
        engine: { running: false, pid: null, source: 'none', managed: false, startedAt: null },
        state: { summarizing: true, queue: 4, current: null, updatedAt: '2026-09-08T21:48:56+08:00', stale: true },
      }),
      '/api/v1/butler/records/recent': () => jsonResponse(200, { records: [] }),
      '/api/v1/butler/summary/dates': () => jsonResponse(200, { dates: [] }),
    });
    await act(async () => root.render(<ButlerPanel />));
    await act(async () => {});
    expect(container.textContent).toContain('异常');
    expect(container.querySelector('[data-role="butler-start"]')).not.toBeNull();
  });

  it('外部旧版实例：运行中但停止不可用并说明原因', async () => {
    installFetch({
      '/api/v1/butler/status': () => jsonResponse(200, {
        engine: { running: true, pid: null, source: 'external-legacy', managed: false, startedAt: null },
        state: { summarizing: false, queue: 0, current: null, updatedAt: '2026-09-08T22:40:00+08:00', stale: false },
      }),
      '/api/v1/butler/records/recent': () => jsonResponse(200, { records: [] }),
      '/api/v1/butler/summary/dates': () => jsonResponse(200, { dates: [] }),
    });
    await act(async () => root.render(<ButlerPanel />));
    await act(async () => {});
    expect(container.textContent).toContain('外部');
    const stopBtn = container.querySelector('[data-role="butler-stop"]') as HTMLButtonElement | null;
    expect(stopBtn).not.toBeNull();
    expect(stopBtn!.disabled).toBe(true);
  });
});

describe('ButlerPanel 按钮错误处理', () => {
  it('启动失败（409 冲突）→ 显示后端错误文案', async () => {
    const mock = installFetch({
      '/api/v1/butler/status': () => jsonResponse(200, {
        engine: { running: false, pid: null, source: 'none', managed: false, startedAt: null },
        state: { summarizing: false, queue: 0, current: null, updatedAt: null, stale: true },
      }),
      '/api/v1/butler/records/recent': () => jsonResponse(200, { records: [] }),
      '/api/v1/butler/summary/dates': () => jsonResponse(200, { dates: [] }),
      '/api/v1/butler/start': () => jsonResponse(409, { error: '引擎已由外部实例运行', code: 'ALREADY_RUNNING' }),
    });
    await act(async () => root.render(<ButlerPanel />));
    await act(async () => {});
    const startBtn = container.querySelector('[data-role="butler-start"]') as HTMLButtonElement;
    expect(startBtn).not.toBeNull();
    await act(async () => startBtn.click());
    await act(async () => {});
    expect(container.textContent).toContain('引擎已由外部实例运行');
    expect(mock).toHaveBeenCalled();
  });

  it('初始状态加载失败（网络错误）→ 显示错误且界面仍可用', async () => {
    const mock = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', mock);
    await act(async () => root.render(<ButlerPanel />));
    await act(async () => {});
    expect(container.textContent).toContain('加载失败');
    expect(container.querySelector('[data-role="butler-start"]')).not.toBeNull();
  });
});
