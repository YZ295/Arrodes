/**
 * TTS 引擎注册表
 *
 * 参考 AIRI 的 unspeech 统一代理模式：
 * - 多个 TTS 引擎可插拔注册
 * - 优先级 + 自动降级链
 * - 引擎能力检测
 * - 统一的 speak/synthesize 接口
 *
 * 当前引擎：
 * - server: Edge TTS（服务端合成，免费）
 * - web: SpeechSynthesis（浏览器内置，零依赖）
 * - 预留: kokoro, chatTTS, elevenlabs
 */
import { api } from '../../shared/utils/apiClient';

// ===== 类型 =====

export interface TtsVoice {
  id: string;
  name: string;
  gender?: string;
  style?: string;
  locale?: string;
}

export interface TtsSynthesizeResult {
  audioBase64?: string;
  contentType?: string;
  audioUrl?: string;
  duration: number;
}

export interface TtsEngine {
  id: string;
  name: string;
  /** 优先级（数字越小越优先） */
  priority: number;
  /** 引擎是否可用 */
  checkAvailable: () => Promise<boolean>;
  /** 获取支持的音色列表 */
  getVoices: () => Promise<TtsVoice[]>;
  /** 合成语音 */
  synthesize: (text: string, voiceId: string, options?: TtsSynthesizeOptions) => Promise<TtsSynthesizeResult>;
}

export interface TtsSynthesizeOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
}

// ===== 引擎注册表 =====

export class TtsEngineRegistry {
  private engines = new Map<string, TtsEngine>();
  private static instance: TtsEngineRegistry;

  static getInstance(): TtsEngineRegistry {
    if (!TtsEngineRegistry.instance) {
      TtsEngineRegistry.instance = new TtsEngineRegistry();
    }
    return TtsEngineRegistry.instance;
  }

  /** 注册引擎 */
  register(engine: TtsEngine): void {
    this.engines.set(engine.id, engine);
  }

  /** 获取引擎 */
  get(id: string): TtsEngine | undefined {
    return this.engines.get(id);
  }

  /** 列出所有已注册引擎（按优先级排序） */
  list(): TtsEngine[] {
    return Array.from(this.engines.values()).sort((a, b) => a.priority - b.priority);
  }

  /** 获取最佳可用引擎（自动降级） */
  async getBestAvailable(): Promise<TtsEngine | null> {
    for (const engine of this.list()) {
      try {
        if (await engine.checkAvailable()) return engine;
      } catch {
        continue;
      }
    }
    return null;
  }

  /** 获取所有可用引擎 */
  async getAvailableEngines(): Promise<TtsEngine[]> {
    const results = await Promise.all(
      this.list().map(async (e) => {
        try {
          return (await e.checkAvailable()) ? e : null;
        } catch {
          return null;
        }
      }),
    );
    return results.filter(Boolean) as TtsEngine[];
  }

  /** 获取引擎的推荐默认音色 */
  async getDefaultVoice(): Promise<TtsVoice> {
    const engine = await this.getBestAvailable();
    if (!engine) throw new Error('无可用 TTS 引擎');
    const voices = await engine.getVoices();
    return voices[0];
  }
}

// ===== 内置引擎实现 =====

/** Edge TTS 引擎（服务端合成） */
export const EdgeTtsEngine: TtsEngine = {
  id: 'server-edge',
  name: 'Edge TTS (云端)',
  priority: 0,

  checkAvailable: async () => {
    try {
      const res = await api.get('/tts/voices');
      return res && (res as any).voices?.length > 0;
    } catch {
      return false;
    }
  },

  getVoices: async () => {
    try {
      const data: any = await api.get('/tts/voices');
      return data.voices || [];
    } catch {
      return [];
    }
  },

  synthesize: async (text, voiceId, options) => {
    const data: any = await api.post('/tts/synthesize', {
      text,
      voice: voiceId,
      rate: options?.rate ?? 1.0,
      pitch: options?.pitch ?? 1.0,
      engine: 'edge',
    });
    return {
      audioBase64: data.audioBase64,
      contentType: data.contentType || 'audio/mp3',
      duration: data.duration || 0,
    };
  },
};

/** Web Speech 引擎（浏览器内置） */
export const WebSpeechTtsEngine: TtsEngine = {
  id: 'web-speech',
  name: 'Web Speech (本地)',
  priority: 1,

  checkAvailable: async () => {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },

  getVoices: async () => {
    return new Promise((resolve) => {
      const getVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          resolve(
            voices
              .filter((v) => v.lang.startsWith('zh'))
              .map((v) => ({
                id: v.voiceURI,
                name: v.name,
                locale: v.lang,
              })),
          );
        } else {
          setTimeout(getVoices, 100);
        }
      };
      getVoices();
    });
  },

  synthesize: async (text, voiceId, options) => {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Web Speech 不可用'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;

      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((v) => v.voiceURI === voiceId);
      if (voice) utterance.voice = voice;

      utterance.onend = () => resolve({ duration: 0 });
      utterance.onerror = (e) => reject(new Error(`Web Speech 错误: ${e.error}`));

      window.speechSynthesis.speak(utterance);
    });
  },
};

/** 初始化内置引擎 */
export function initTtsRegistry(): void {
  const registry = TtsEngineRegistry.getInstance();
  registry.register(EdgeTtsEngine);
  registry.register(WebSpeechTtsEngine);
}
