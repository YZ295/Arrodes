// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VisionPanel from './VisionPanel';
import type { ContinuousVisionController } from './useContinuousVision';

vi.mock('./useCamera', () => ({ useCamera: () => ({
  stream: null, snapshot: 'data:image/png;base64,cG5n', error: null,
  startCamera: vi.fn(), stopCamera: vi.fn(), takeSnapshot: vi.fn(),
  loadFromFile: async () => 'cG5n',
}) }));

let container: HTMLDivElement;
let root: Root;
const online = { available: true, provider: 'ollama', model: 'qwen3-vl:4b-instruct', state: 'ready', device: 'ollama' };
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
    const watcher: ContinuousVisionController = {
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
      taskSession: {
        active: true,
        phase: 'observing',
        state: 'Compiling sketch',
        nextAction: '等待编译结果',
        verification: { result: 'none', expected: null, basis: '这是本次任务的第一次观察。' },
        observationCount: 1,
      },
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
    const watcher: ContinuousVisionController = {
      active: false,
      analyzing: false,
      error: null,
      observation: null,
      goal: '识别当前屏幕正在进行的任务',
      setGoal: vi.fn(),
      start,
      stop,
      taskSession: {
        active: false,
        phase: 'idle',
        state: null,
        nextAction: null,
        verification: { result: 'none', expected: null, basis: '还没有开始任务。' },
        observationCount: 0,
      },
    };
    await render(watcher);
    await click('开始任务');
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<VisionPanel continuousVision={{
        ...watcher,
        active: true,
        observation: { description: '当前是代码编辑器', durationMs: 20, model: 'mage' },
      }} />);
    });
    expect(container.textContent).toContain('任务进行中');
    expect(container.textContent).toContain('当前是代码编辑器');
    await click('停止任务');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('renders the task session as current state, single next step and previous-step verification', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(online)));
    const watcher: ContinuousVisionController = {
      active: true,
      analyzing: false,
      error: null,
      goal: '确认 Arduino 程序是否上传成功',
      setGoal: vi.fn(),
      observation: {
        description: 'Arduino IDE 输出面板显示上传完成',
        durationMs: 20,
        model: 'qwen3-vl:4b-instruct',
        observedAt: '2026-09-06T12:00:00.000Z',
        visibleText: ['Done uploading.'],
      },
      start: vi.fn(),
      stop: vi.fn(),
      taskSession: {
        active: true,
        phase: 'advancing',
        state: 'Blink 已上传到开发板',
        nextAction: '切回摄像头确认板载 LED 每秒亮灭一次',
        verification: {
          result: 'confirmed',
          expected: 'Done uploading.',
          basis: '画面中出现了上一步期望的「Done uploading.」，上一步已完成。',
        },
        observationCount: 3,
      },
    };

    await render(watcher);

    // 「当前状态 + 唯一下一步」必须成对出现，用户不需要自己判断哪条是下一步
    expect(container.textContent).toContain('Blink 已上传到开发板');
    expect(container.textContent).toContain('切回摄像头确认板载 LED 每秒亮灭一次');
    // 上一步验证结果要可见，否则用户不知道系统凭什么推进
    expect(container.textContent).toContain('Done uploading.');
    expect(container.textContent).toContain('上一步已完成');
    expect(container.textContent).toContain('第 3 次观察');
  });

  it('marks structured degradation instead of passing free text off as structured evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(online)));
    const watcher: ContinuousVisionController = {
      active: true,
      analyzing: false,
      error: null,
      goal: '识别当前屏幕',
      setGoal: vi.fn(),
      observation: {
        description: '屏幕上似乎是一个代码编辑器，我看不太清楚具体内容。',
        durationMs: 20,
        model: 'qwen3-vl:4b-instruct',
        observedAt: '2026-09-06T12:00:00.000Z',
        visibleText: [],
        uncertainties: ['视觉模型未返回结构化字段'],
        structuredFallback: true,
      },
      start: vi.fn(),
      stop: vi.fn(),
      taskSession: {
        active: true,
        phase: 'waiting-evidence',
        state: null,
        nextAction: null,
        verification: { result: 'none', expected: null, basis: '这是本次任务的第一次观察，还没有上一步可验证。' },
        observationCount: 1,
      },
    };

    await render(watcher);

    // 降级必须显式标注：保留原始摘要，但不能让用户以为这是结构化的屏幕事实
    expect(container.textContent).toContain('结构化降级');
    expect(container.textContent).toContain('屏幕上似乎是一个代码编辑器');
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
    expect(container.textContent).toContain('qwen3-vl:4b-instruct');
    expect(container.textContent).toContain('首次分析');
    await click('上传图片');
    await click('让阿罗德斯看看');
    const request = fetchMock.mock.calls.find(([url]) => url.endsWith('/analyze-base64'))!;
    expect(JSON.parse(request[1].body).imageFormat).toBe('png');
    expect(container.textContent).toContain('蓝色方块');
  });

  it('shows offline recovery, prevents analysis, and allows retry without losing the image', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ...online, available: false, error: '请确认 Ollama 已启动并安装 qwen3-vl:4b-instruct' }))
      .mockResolvedValueOnce(Response.json(online));
    vi.stubGlobal('fetch', fetchMock);
    await render();
    expect(container.textContent).toContain('请确认 Ollama 已启动并安装 qwen3-vl:4b-instruct');
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
      .mockResolvedValueOnce(Response.json({ ...online, available: false, error: '请运行 ollama pull qwen3-vl:4b-instruct' })));
    await render();
    await click('上传图片');
    await click('让阿罗德斯看看');
    expect(container.textContent).toContain('模型加载失败');
    expect(container.textContent).toContain('ollama pull qwen3-vl:4b-instruct');
    expect(findButton('让阿罗德斯看看').disabled).toBe(true);
    expect(container.querySelector('img')).not.toBeNull();
  });
});
