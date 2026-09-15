import { describe, it, expect, vi, afterEach } from 'vitest';
import { DeepSeekLlmProvider } from './llmProvider.js';

const BASE = {
  model: 'm1',
  baseUrl: 'https://api.example.com',
  providerName: 'test',
  apiKey: 'k',
  requiresKey: true,
  maxTokens: 8,
  temperature: 0.3,
};

describe('DeepSeekLlmProvider（LLM 能力 seam）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('非流式：调用 /chat/completions 并回传 onChunk / onComplete / usage', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '你好' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new DeepSeekLlmProvider();
    const chunks: string[] = [];
    let completed = '';
    let usage: unknown;
    await provider.request(
      [{ role: 'user', content: 'hi' }],
      { ...BASE, stream: false },
      {
        onChunk: (t) => chunks.push(t),
        onComplete: (t, u) => { completed = t; usage = u; },
        onError: () => {},
      },
    );

    expect(chunks).toEqual(['你好']);
    expect(completed).toBe('你好');
    expect(usage).toEqual({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer k' }),
      }),
    );
  });

  it('流式：解析 SSE 增量并回传 usage', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"好"}}],"usage":{"prompt_tokens":10,"completion_tokens":2}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const fetchMock = vi.fn(async () => new Response(sse, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new DeepSeekLlmProvider();
    const chunks: string[] = [];
    let completed = '';
    let usage: unknown;
    await provider.request(
      [{ role: 'user', content: 'hi' }],
      { ...BASE, stream: true },
      {
        onChunk: (t) => chunks.push(t),
        onComplete: (t, u) => { completed = t; usage = u; },
        onError: () => {},
      },
    );

    expect(chunks).toEqual(['你', '好']);
    expect(completed).toBe('你好');
    expect(usage).toEqual({ prompt_tokens: 10, completion_tokens: 2 });
  });
});
