/**
 * 服务端语音识别服务（D2=C：混合策略）
 *
 * 模式：
 * - online：SiliconFlow SenseVoiceSmall（默认，保持现有行为）
 * - local：faster-whisper 本地侧车（stt_sidecar.py，声音不出本机）
 * - auto：优先本地，失败自动回退在线
 */

export type SttMode = 'online' | 'local' | 'auto';

export const STT_MODES: SttMode[] = ['online', 'local', 'auto'];

export interface SttTranscribeDeps {
  fetchFn: typeof fetch;
  localUrl: string;
  siliconflowBaseUrl: string;
  siliconflowApiKey: string;
}

export interface TranscribeOutcome {
  text: string;
  engine: SttMode;
  usedFallback?: boolean;
}

export function isSttMode(value: unknown): value is SttMode {
  return value === 'online' || value === 'local' || value === 'auto';
}

/** Buffer<ArrayBufferLike> 与 BlobPart 的 TS 兼容转换 */
function bufferToBlobPart(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export async function transcribeOnline(
  deps: SttTranscribeDeps,
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<string> {
  if (!deps.siliconflowApiKey) {
    throw new Error('SILICONFLOW_API_KEY 未配置，无法使用在线识别');
  }
  const form = new FormData();
  const safeName = filename && filename.length > 0 ? filename : `audio-${Date.now()}.webm`;
  form.append('file', new Blob([bufferToBlobPart(buffer)], { type: mimetype }), safeName);
  form.append('model', 'FunAudioLLM/SenseVoiceSmall');

  const resp = await deps.fetchFn(`${deps.siliconflowBaseUrl}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${deps.siliconflowApiKey}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`在线语音识别失败 (${resp.status}): ${errBody.slice(0, 120)}`);
  }
  const data = (await resp.json().catch(() => ({}))) as { text?: string };
  const text = (data.text || '').trim();
  if (!text) throw new Error('未识别到语音内容');
  return text;
}

export async function transcribeLocal(
  deps: SttTranscribeDeps,
  buffer: Buffer,
  filename: string,
  _mimetype: string,
): Promise<string> {
  const resp = await deps.fetchFn(`${deps.localUrl}/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_base64: buffer.toString('base64'),
      filename: filename || 'audio.webm',
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`本地识别失败 (${resp.status}): ${errBody.slice(0, 120)}`);
  }
  const data = (await resp.json().catch(() => ({}))) as { text?: string };
  const text = (data.text || '').trim();
  if (!text) throw new Error('本地未识别到语音内容');
  return text;
}

export async function transcribeAudio(
  mode: SttMode,
  buffer: Buffer,
  filename: string,
  mimetype: string,
  deps: SttTranscribeDeps,
): Promise<TranscribeOutcome> {
  switch (mode) {
    case 'local':
      return { text: await transcribeLocal(deps, buffer, filename, mimetype), engine: 'local' };
    case 'auto':
      try {
        return { text: await transcribeLocal(deps, buffer, filename, mimetype), engine: 'local' };
      } catch (localErr) {
        try {
          return {
            text: await transcribeOnline(deps, buffer, filename, mimetype),
            engine: 'online',
            usedFallback: true,
          };
        } catch (onlineErr) {
          const lm = localErr instanceof Error ? localErr.message : String(localErr);
          const om = onlineErr instanceof Error ? onlineErr.message : String(onlineErr);
          throw new Error(`本地与在线识别均失败。本地: ${lm}；在线: ${om}`);
        }
      }
    case 'online':
    default:
      return { text: await transcribeOnline(deps, buffer, filename, mimetype), engine: 'online' };
  }
}
