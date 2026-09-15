import { readFileSync } from 'node:fs';

export interface TtsAudioResult {
  audioBase64: string;
  contentType: string;
}

export type TtsSynthesizer = (
  text: string,
  voice: string,
  rate: number,
  promptWav?: string,
  promptText?: string,
  signal?: AbortSignal,
) => Promise<TtsAudioResult>;

type FetchLike = typeof fetch;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

async function responseError(response: Response, provider: string): Promise<Error> {
  const body = await response.text().catch(() => '');
  return new Error(`${provider} 合成失败: ${body || `HTTP ${response.status}`}`);
}

/** Audio8 官方提供 OpenAI 兼容的 /v1/audio/speech。 */
export function createAudio8Synthesizer(options: {
  baseUrl: string;
  model?: string;
  apiKey?: string;
  fetchImpl?: FetchLike;
}): TtsSynthesizer {
  const fetchImpl = options.fetchImpl ?? fetch;
  const root = trimTrailingSlash(options.baseUrl);
  const endpoint = root.endsWith('/v1') ? `${root}/audio/speech` : `${root}/v1/audio/speech`;

  return async (text, voice, _rate, promptWav, promptText, signal) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: options.model || 'audio8/tts-0.1b',
        input: text,
        voice,
        response_format: 'wav',
        ...(promptWav ? {
          references: [{ audio_path: promptWav, text: promptText || '' }],
        } : {}),
      }),
      signal,
    });
    if (!response.ok) throw await responseError(response, 'Audio8');
    const audio = Buffer.from(await response.arrayBuffer());
    return {
      audioBase64: audio.toString('base64'),
      contentType: response.headers.get('content-type')?.split(';')[0] || 'audio/wav',
    };
  };
}

/** 连接独立启动的 CosyVoice3 sidecar。 */
export function createCosyVoiceSidecarSynthesizer(options: {
  baseUrl: string;
  fetchImpl?: FetchLike;
  readFile?: (path: string) => Buffer;
}): TtsSynthesizer {
  const fetchImpl = options.fetchImpl ?? fetch;
  const readFile = options.readFile ?? readFileSync;
  const endpoint = `${trimTrailingSlash(options.baseUrl)}/synthesize`;

  return async (text, voice, rate, promptWav, promptText, signal) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        rate,
        ...(promptWav ? { promptWav, promptText } : {}),
      }),
      signal,
    });
    if (!response.ok) throw await responseError(response, 'CosyVoice3');
    const data = await response.json() as { audioPath?: string; contentType?: string };
    if (!data.audioPath) throw new Error('CosyVoice3 sidecar 未返回 audioPath');
    return {
      audioBase64: readFile(data.audioPath).toString('base64'),
      contentType: data.contentType || 'audio/wav',
    };
  };
}
