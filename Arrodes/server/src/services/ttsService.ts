/** 阿罗德斯统一 TTS 服务：可插拔 provider、串行限流、可取消重试。 */
import {
  createAudio8Synthesizer,
  type TtsSynthesizer,
} from './ttsProviders.js';

export type TtsProviderId = 'cosyvoice3' | 'audio8';
/** local 为旧客户端兼容别名，响应始终返回规范 provider id。 */
export type TtsEngine = TtsProviderId | 'local';

export interface TtsRequest {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  engine?: TtsEngine;
  promptWav?: string;
  promptText?: string;
}

export interface TtsResponse {
  audioBase64: string;
  contentType: string;
  engine: TtsProviderId;
  voice: string;
  duration: number;
  audioUrl?: string;
}

export interface TtsProviderInfo {
  id: TtsProviderId;
  name: string;
  configured: boolean;
}

export type LocalSynthesizer = TtsSynthesizer;
type AdditionalProviders = Partial<Record<Exclude<TtsProviderId, 'cosyvoice3'>, TtsSynthesizer>>;

const defaultLocalSynthesize: LocalSynthesizer = async (
  text, _voice, rate, promptWav, promptText, signal,
) => {
  const { cosyVoiceEngine } = await import('./cosyVoiceProxy.js');
  const { audioPath } = await cosyVoiceEngine.synthesize(
    text, 'default', rate, promptWav, promptText, signal,
  );
  const { readFileSync } = await import('node:fs');
  const wavBuffer = readFileSync(audioPath);
  return { audioBase64: wavBuffer.toString('base64'), contentType: 'audio/wav' };
};

function defaultAdditionalProviders(): AdditionalProviders {
  const providers: AdditionalProviders = {};
  if (process.env.AUDIO8_TTS_BASE_URL) {
    providers.audio8 = createAudio8Synthesizer({
      baseUrl: process.env.AUDIO8_TTS_BASE_URL,
      model: process.env.AUDIO8_TTS_MODEL,
      apiKey: process.env.AUDIO8_TTS_API_KEY,
    });
  }
  return providers;
}

let ttsChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = ttsChain.then(() => task());
  ttsChain = run.catch(() => undefined);
  return run;
}

function abortError(): Error {
  const error = new Error('TTS request aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function normalizeProvider(engine?: string): TtsProviderId {
  if (!engine || ['cosyvoice2', 'local', 'server', 'edge', 'web'].includes(engine)) return 'cosyvoice3';
  if (engine === 'cosyvoice3' || engine === 'audio8') return engine;
  throw new Error(`未知 TTS 引擎: ${engine}`);
}

export interface TtsStats {
  totalAttempts: number;
  totalFailures: number;
  lastError?: string;
  lastErrorAt?: string;
}

const ttsStats: TtsStats = { totalAttempts: 0, totalFailures: 0 };

export function getTtsStats(): TtsStats {
  return { ...ttsStats };
}

export class TtsService {
  private readonly providers: Partial<Record<TtsProviderId, TtsSynthesizer>>;

  constructor(localSynthesizer?: LocalSynthesizer, additionalProviders: AdditionalProviders = {}) {
    this.providers = {
      cosyvoice3: localSynthesizer ?? defaultLocalSynthesize,
      ...additionalProviders,
    };
  }

  async synthesize(
    request: TtsRequest,
    options: { signal?: AbortSignal } = {},
  ): Promise<TtsResponse> {
    const {
      text, voice = 'default', rate = 1.0, engine, promptWav, promptText,
    } = request;
    const { signal } = options;

    if (!text || !text.trim()) throw new Error('文本不能为空');
    if (text.length > 2000) throw new Error('文本过长（最大 2000 字）');
    throwIfAborted(signal);

    const providerId = normalizeProvider(engine);
    const provider = this.providers[providerId];
    if (!provider) throw new Error(`TTS 引擎 ${providerId} 未配置`);
    const speakText = text.length > 1000 ? text.slice(0, 1000) : text;

    return enqueue(async () => {
      throwIfAborted(signal);
      let result: Awaited<ReturnType<TtsSynthesizer>> | undefined;
      let lastErr: unknown;

      for (let attempt = 1; attempt <= 5; attempt++) {
        throwIfAborted(signal);
        ttsStats.totalAttempts++;
        try {
          result = await provider(speakText, voice, rate, promptWav, promptText, signal);
          break;
        } catch (err) {
          if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
            throw abortError();
          }
          lastErr = err;
          ttsStats.totalFailures++;
          ttsStats.lastError = err instanceof Error ? err.message : String(err);
          ttsStats.lastErrorAt = new Date().toISOString();
          if (attempt < 5) {
            const waitMs = attempt * 1000;
            console.warn(
              `[TTS:${providerId}] 合成失败（第 ${attempt} 次），${waitMs}ms 后重试:`,
              err instanceof Error ? err.message : err,
            );
            await abortableDelay(waitMs, signal);
          }
        }
      }

      if (!result) throw lastErr;
      return {
        ...result,
        engine: providerId,
        voice,
        duration: speakText.length / 4,
      };
    });
  }

  getProviders(): TtsProviderInfo[] {
    return [
      { id: 'cosyvoice3', name: 'Fun-CosyVoice3（当前本地）', configured: Boolean(this.providers.cosyvoice3) },
      { id: 'audio8', name: 'Audio8（OpenAI 兼容）', configured: Boolean(this.providers.audio8) },
    ];
  }

  getVoices(): Array<{ id: string; name: string; gender: string; style: string }> {
    return [{ id: 'default', name: '默认音色', gender: 'female', style: '自然、清晰' }];
  }
}

export const ttsService = new TtsService(defaultLocalSynthesize, defaultAdditionalProviders());
