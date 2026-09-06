/**
 * 视觉服务测试（DeepSeek V4 Flash Vision Exp 多模态）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('visionService（DeepSeek V4 Flash Vision Exp）', () => {
  beforeEach(() => {
    process.env.VISION_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'sk-test-1234567890';
    process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
    process.env.VISION_MODEL = 'deepseek-v4-flash-vision-exp';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VISION_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.VISION_MODEL;
  });

  it('checkVisionModel：DeepSeek 配置了 key 即可用', async () => {
    const { checkVisionModel } = await import('./visionService.js');
    const status = await checkVisionModel();
    expect(status.available).toBe(true);
    expect(status.model).toBe('deepseek-v4-flash-vision-exp');
  });

  it('analyze：调用 /chat/completions 并携带 image_url', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: '图片里有一只猫' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { visionService } = await import('./visionService.js');
    const result = await visionService.analyze({
      imageBase64: 'aGVsbG8=',
      imageFormat: 'jpeg',
      prompt: '描述图片',
    });

    expect(result.description).toBe('图片里有一只猫');
    expect(result.model).toBe('deepseek-v4-flash-vision-exp');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('deepseek-v4-flash-vision-exp');
    expect(body.messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,aGVsbG8=');
  });
});

describe('visionService（Mage-VL 本地 sidecar）', () => {
  beforeEach(() => {
    vi.resetModules(); // 强制重新加载模块，使 VISION_PROVIDER 常量按新 env 求值
    process.env.VISION_PROVIDER = 'magevl';
    process.env.MAGEVL_SIDECAR_URL = 'http://127.0.0.1:12002';
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.VISION_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.VISION_PROVIDER;
    delete process.env.MAGEVL_SIDECAR_URL;
  });

  it('checkVisionModel：sidecar 健康即可用', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'ok', model: 'microsoft/Mage-VL',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const { checkVisionModel } = await import('./visionService.js');
    const status = await checkVisionModel();
    expect(status.available).toBe(true);
    expect(status.model).toBe('microsoft/Mage-VL');
  });

  it('checkVisionModel：sidecar 离线时不可用并提示启动命令', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }));

    const { checkVisionModel } = await import('./visionService.js');
    const status = await checkVisionModel();
    expect(status.available).toBe(false);
    expect(status.error).toContain('mage_vl_sidecar.py');
  });

  it('analyze：调用 sidecar /analyze 并返回描述', async () => {
    const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe('http://127.0.0.1:12002/analyze');
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.image_base64).toBe('aGVsbG8=');
      expect(body.prompt).toBe('描述图片');
      return new Response(JSON.stringify({
        text: '画面中有一个显示器，显示代码编辑器',
        duration_ms: 420,
        model: 'microsoft/Mage-VL',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { visionService } = await import('./visionService.js');
    const result = await visionService.analyze({
      imageBase64: 'aGVsbG8=',
      imageFormat: 'jpeg',
      prompt: '描述图片',
    });

    expect(result.description).toBe('画面中有一个显示器，显示代码编辑器');
    expect(result.model).toBe('microsoft/Mage-VL');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('analyzeStream：Mage-VL 一次性返回完整文本', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      text: '桌面显示 VS Code 和终端窗口',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const { visionService } = await import('./visionService.js');
    const chunks: string[] = [];
    let completed = '';
    await visionService.analyzeStream(
      { imageBase64: 'aGVsbG8=', prompt: '描述' },
      {
        onChunk: (t) => chunks.push(t),
        onComplete: (t) => { completed = t; },
        onError: () => {},
      },
    );
    expect(completed).toBe('桌面显示 VS Code 和终端窗口');
    expect(chunks.join('')).toBe('桌面显示 VS Code 和终端窗口');
  });
});
