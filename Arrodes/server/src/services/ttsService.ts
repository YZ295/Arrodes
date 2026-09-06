/**
 * 阿罗德斯 TTS 服务 v3（纯本地）
 *
 * 2026-08-08 决策：移除云端引擎（Edge TTS），仅保留本地 CosyVoice。
 * - 本地合成零成本、离线稳定、隐私不出本机（商业化考虑）
 * - 移除：Edge WebSocket 合成、Sec-MS-GEC 签名、云端音色列表
 * - 保留：串行队列（防并发压力）、指数退避重试、失败统计
 */

// ===== 类型 =====

export type TtsEngine = 'local';

export interface TtsRequest {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  engine?: TtsEngine;
  /** T9 自定义音色：参考音频路径（可选） */
  promptWav?: string;
  promptText?: string;
}

export interface TtsResponse {
  audioBase64: string;
  contentType: string;
  engine: TtsEngine;
  voice: string;
  duration: number;
  audioUrl?: string;
}

/** 本地合成器签名（可注入 mock 用于测试） */
export type LocalSynthesizer = (
  text: string,
  voice: string,
  rate: number,
  /** T9 自定义音色：参考音频路径（可选） */
  promptWav?: string,
  promptText?: string,
) => Promise<{ audioBase64: string; contentType: string }>;

// ===== 本地 CosyVoice 合成 =====

/** 默认本地合成实现：调用 cosyVoiceProxy（懒启动 sidecar） */
const defaultLocalSynthesize: LocalSynthesizer = async (text, _voice, rate, promptWav, promptText) => {
  const { cosyVoiceEngine } = await import('./cosyVoiceProxy.js');
  const { audioPath } = await cosyVoiceEngine.synthesize(text, 'default', rate, promptWav, promptText);
  const { readFileSync } = await import('node:fs');
  const wavBuffer = readFileSync(audioPath);
  return {
    audioBase64: wavBuffer.toString('base64'),
    contentType: 'audio/wav',
  };
};

// ===== 串行队列 =====

let ttsChain: Promise<unknown> = Promise.resolve();

/** 串行化执行：一次只处理一个 TTS 合成请求（防并发压力） */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = ttsChain.then(() => task());
  ttsChain = run.catch(() => undefined);
  return run;
}

// ===== 失败统计（可观测，供诊断） =====

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

// ===== 服务类 =====

export class TtsService {
  /** 本地合成器（可注入 mock 用于测试；默认真实 CosyVoice 实现） */
  private localSynthesizer: LocalSynthesizer;

  constructor(localSynthesizer?: LocalSynthesizer) {
    this.localSynthesizer = localSynthesizer ?? defaultLocalSynthesize;
  }

  async synthesize(request: TtsRequest): Promise<TtsResponse> {
    const { text, voice = 'default', rate = 1.0, pitch = 1.0, engine = 'local', promptWav, promptText } = request;

    if (!text || !text.trim()) throw new Error('文本不能为空');
    if (text.length > 2000) throw new Error('文本过长（最大 2000 字）');
    // 超长文本截断：朗读前 1000 字（避免合成超时）
    const speakText = text.length > 1000 ? text.slice(0, 1000) : text;

    // 纯本地引擎；如传入其他引擎值则视为 local（兼容旧请求）
    if (engine !== 'local') {
      console.warn(`[TTS] 引擎 "${engine}" 已随云端移除，使用本地引擎`);
    }

    // 串行队列 + 指数退避重试（最多 5 次）
    return enqueue(async () => {
      let result: { audioBase64: string; contentType: string } | undefined;
      let lastErr: unknown;

      for (let attempt = 1; attempt <= 5; attempt++) {
        ttsStats.totalAttempts++;
        try {
          result = await this.localSynthesizer(speakText, voice, rate, promptWav, promptText);
          break;
        } catch (err) {
          lastErr = err;
          ttsStats.totalFailures++;
          ttsStats.lastError = err instanceof Error ? err.message : String(err);
          ttsStats.lastErrorAt = new Date().toISOString();
          if (attempt < 5) {
            const waitMs = attempt * 1000;
            console.warn(`[TTS] 本地合成失败（第 ${attempt} 次），${waitMs}ms 后重试:`, err instanceof Error ? err.message : err);
            await new Promise((r) => setTimeout(r, waitMs));
          }
        }
      }

      if (!result) throw lastErr;
      return {
        ...result,
        engine: 'local',
        voice,
        duration: speakText.length / 4,
      };
    });
  }

  /** 本地音色列表（CosyVoice 预设） */
  getVoices(): Array<{ id: string; name: string; gender: string; style: string }> {
    return [
      { id: 'default', name: '默认音色', gender: 'female', style: '自然、清晰' },
    ];
  }
}

export const ttsService = new TtsService();
