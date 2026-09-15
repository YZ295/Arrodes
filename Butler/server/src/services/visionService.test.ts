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

  it('只接受受支持格式且校验图片签名和解码后大小', async () => {
    const { visionService } = await import('./visionService.js');
    const validPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(1024),
    ]).toString('base64');
    const invalid = Buffer.alloc(1024).toString('base64');

    expect(visionService.validateImage(validPng, 'png').valid).toBe(true);
    expect(visionService.validateImage(validPng, 'bmp').valid).toBe(false);
    expect(visionService.validateImage(invalid, 'png').valid).toBe(false);
  });
});
