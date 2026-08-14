/**
 * LLM 能力 seam（Definition / Provider / Consumer）
 *
 * - LlmProvider：Service Definition（模型 wire 层：一次 chat/completions 请求）
 * - DeepSeekLlmProvider：Service Provider（OpenAI 兼容 /chat/completions + SSE）
 * - Consumer：services/llmService.ts（策略层：密钥 / 额度 / 用量 / 提示词外壳）
 *
 * Provider 只负责协议；策略留在 Consumer，换 Provider 即换模型供应商。
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface LlmRequestOptions {
  model: string;
  baseUrl: string;
  providerName: string;
  apiKey?: string;
  requiresKey: boolean;
  stream: boolean;
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export interface LlmStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string, usage?: LlmUsage) => void;
  onError: (error: string) => void;
}

export interface LlmProvider {
  request(
    messages: LlmMessage[],
    options: LlmRequestOptions,
    callbacks: LlmStreamCallbacks,
  ): Promise<void>;
}

export class DeepSeekLlmProvider implements LlmProvider {
  async request(
    messages: LlmMessage[],
    options: LlmRequestOptions,
    callbacks: LlmStreamCallbacks,
  ): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (options.requiresKey && options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
      }

      const requestBody = JSON.stringify({
        model: options.model,
        messages,
        stream: options.stream,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      });

      const response = await fetch(`${options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: requestBody,
        signal: options.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        callbacks.onError(`${options.providerName} ${response.status}: ${errBody.slice(0, 200)}`);
        return;
      }

      if (!options.stream) {
        const json = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: LlmUsage;
        };
        const text = json.choices?.[0]?.message?.content || '';
        callbacks.onChunk(text);
        callbacks.onComplete(text, json.usage);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError('Response body is not readable');
        return;
      }

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let streamUsage: LlmUsage | undefined;

      while (true) {
        if (options.signal?.aborted) {
          callbacks.onError('stopped');
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              callbacks.onChunk(delta);
            }
            if (json.usage) streamUsage = json.usage;
          } catch {
            // skip parse errors
          }
        }
      }

      callbacks.onComplete(fullText, streamUsage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知 LLM 错误';
      callbacks.onError(msg);
    }
  }
}

let provider: LlmProvider = new DeepSeekLlmProvider();

export function getLlmProvider(): LlmProvider {
  return provider;
}

export function setLlmProvider(p: LlmProvider): void {
  provider = p;
}
