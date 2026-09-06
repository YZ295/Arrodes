// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VisionPanel from './VisionPanel';

vi.mock('./useCamera', () => ({ useCamera: () => ({
  stream: null, snapshot: 'data:image/png;base64,cG5n', error: null,
  startCamera: vi.fn(), stopCamera: vi.fn(), takeSnapshot: vi.fn(),
  loadFromFile: async () => 'cG5n',
}) }));

let container: HTMLDivElement;
let root: Root;
const online = { available: true, provider: 'magevl', model: 'microsoft/Mage-VL', state: 'ready', device: 'not-loaded' };
const findButton = (text: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(text))!;
async function click(text: string) { await act(async () => { findButton(text).click(); }); }
async function render(continuousVision?: any) {
  await act(async () => { root.render(<VisionPanel continuousVision={continuousVision} />); });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Vision panel readiness', () => {
  it('binds screen observation to a user goal and shows structured evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(online)));
    const setGoal = vi.fn();
    const watcher = {
      active: true,
      analyzing: false,
      error: null,
      goal: '识别当前屏幕',
      setGoal,
      observation: {
        description: 'Arduino IDE 正在编译',
        durationMs: 20,
        model: 'mage',
        observedAt: '2026-09-06T12:00:00.000Z',
        activeApplication: 'Arduino IDE',
        userActivity: '编译 Blink',
        visibleText: ['Compiling sketch'],
        uncertainties: ['还没看到上传结果'],
      },
      start: vi.fn(),
      stop: vi.fn(),
    };

    await render(watcher);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="屏幕观察目标"]');
    expect(input).not.toBeNull();
    if (!input) return;
    expect(input.value).toBe('识别当前屏幕');
    await act(async () => {
      const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setNativeValue?.call(input, '确认 Arduino 程序是否上传成功');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(setGoal).toHaveBeenCalledWith('确认 Arduino 程序是否上传成功');
    expect(container.textContent).toContain('Arduino IDE');
    expect(container.textContent).toContain('编译 Blink');
    expect(container.textContent).toContain('Compiling sketch');
    expect(container.textContent).toContain('还没看到上传结果');
    expect(container.textContent).toContain('观察时间');
  });

  it('starts and stops resident screen observation from one clear control', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(online)));
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn();
    const watcher = {
      active: false,
      analyzing: false,
      error: null,
      observation: null,
      goal: '识别当前屏幕正在进行的任务',
      setGoal: vi.fn(),
      start,
      stop,
    };
    await render(watcher);
    await click('开启屏幕观察');
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<VisionPanel continuousVision={{
        ...watcher,
        active: true,
        observation: { description: '当前是代码编辑器', durationMs: 20, model: 'mage' },
      }} />);
    });
    expect(container.textContent).toContain('屏幕观察已开启');
    expect(container.textContent).toContain('当前是代码编辑器');
    await click('停止屏幕观察');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('checks status on mount and cancels it on unmount', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    await render();
    expect(container.textContent).toContain('正在检查视觉服务');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/vision/status', expect.objectContaining({ signal: expect.anything() }));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
  });

  it('shows cold-start guidance, and preserves the PNG format when analyzing', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => Response.json(
      url.endsWith('/status') ? online : { description: '蓝色方块', durationMs: 10, model: online.model },
    ));
    vi.stubGlobal('fetch', fetchMock);
    await render();
    expect(container.textContent).toContain('microsoft/Mage-VL');
    expect(container.textContent).toContain('首次分析');
    await click('上传图片');
    await click('让阿罗德斯看看');
    const request = fetchMock.mock.calls.find(([url]) => url.endsWith('/analyze-base64'))!;
    expect(JSON.parse(request[1].body).imageFormat).toBe('png');
    expect(container.textContent).toContain('蓝色方块');
  });

  it('shows offline recovery, prevents analysis, and allows retry without losing the image', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ...online, available: false, error: '运行 start-magevl.ps1 并检查 MAGEVL_SIDECAR_URL' }))
      .mockResolvedValueOnce(Response.json(online));
    vi.stubGlobal('fetch', fetchMock);
    await render();
    expect(container.textContent).toContain('start-magevl.ps1');
    await click('上传图片');
    expect(findButton('让阿罗德斯看看').disabled).toBe(true);
    await click('重新检查');
    expect(findButton('让阿罗德斯看看').disabled).toBe(false);
    expect(container.querySelector('img')?.src).toContain('data:image/png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 503])('handles status HTTP %s with backend guidance, not a false available state', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status })));
    await render();
    expect(container.textContent).toContain('无法检查视觉服务');
    expect(container.textContent).toContain(String(status));
    expect(container.textContent).toContain('后端');
    expect(findButton('重新检查')).toBeDefined();
  });

  it('treats malformed status JSON as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ available: 'yes' })));
    await render();
    expect(container.textContent).toContain('无法检查视觉服务');
  });

  it('times out a stalled health request and exposes retry', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(container.textContent).toContain('请求超时');
    expect(findButton('重新检查').disabled).toBe(false);
  });

  it('rechecks availability after inference failure while retaining the selected image', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json(online))
      .mockResolvedValueOnce(Response.json({ error: '模型加载失败' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ...online, available: false, error: '请运行 start-magevl.ps1' })));
    await render();
    await click('上传图片');
    await click('让阿罗德斯看看');
    expect(container.textContent).toContain('模型加载失败');
    expect(container.textContent).toContain('start-magevl.ps1');
    expect(findButton('让阿罗德斯看看').disabled).toBe(true);
    expect(container.querySelector('img')).not.toBeNull();
  });
});
