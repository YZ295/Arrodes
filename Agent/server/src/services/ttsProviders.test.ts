import { describe, expect, it, vi } from 'vitest';
import {
  createAudio8Synthesizer,
  createCosyVoiceSidecarSynthesizer,
} from './ttsProviders.js';

describe('可插拔 TTS provider', () => {
  it('Audio8 使用 OpenAI 兼容 /v1/audio/speech，并转为 base64', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      new Uint8Array([1, 2, 3]),
      { status: 200, headers: { 'Content-Type': 'audio/wav' } },
    ));
    const synthesize = createAudio8Synthesizer({
      baseUrl: 'http://127.0.0.1:12004/v1/',
      model: 'audio8-0.1b',
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const signal = new AbortController().signal;

    const result = await synthesize('你好', 'speaker-a', 1.25, 'D:/voices/ref.wav', '参考文本', signal);

    expect(result).toEqual({ audioBase64: 'AQID', contentType: 'audio/wav' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    const [url, init] = calls[0];
    expect(url).toBe('http://127.0.0.1:12004/v1/audio/speech');
    expect(init?.signal).toBe(signal);
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(JSON.parse(String(init?.body))).toEqual({
      input: '你好',
      model: 'audio8-0.1b',
      response_format: 'wav',
      voice: 'speaker-a',
      references: [{ audio_path: 'D:/voices/ref.wav', text: '参考文本' }],
    });
  });

  it('CosyVoice3 sidecar 使用独立地址并读取返回的本地 wav', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ audioPath: 'D:/tmp/cosy3.wav' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const readFile = vi.fn(() => Buffer.from([4, 5, 6]));
    const synthesize = createCosyVoiceSidecarSynthesizer({
      baseUrl: 'http://127.0.0.1:12003/',
      fetchImpl: fetchImpl as typeof fetch,
      readFile,
    });
    const signal = new AbortController().signal;

    const result = await synthesize('升级测试', 'default', 0.9, undefined, undefined, signal);

    expect(result).toEqual({ audioBase64: 'BAUG', contentType: 'audio/wav' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:12003/synthesize',
      expect.objectContaining({ signal }),
    );
    expect(readFile).toHaveBeenCalledWith('D:/tmp/cosy3.wav');
  });
});
