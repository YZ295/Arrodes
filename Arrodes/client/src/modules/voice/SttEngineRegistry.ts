/**
 * STT 引擎注册表
 *
 * 参考 AIRI 的 unspeech 统一代理模式。
 *
 * 当前引擎：
 * - web-speech: SpeechRecognition（浏览器内置，免费）
 * - 预留: whisper (服务端/本地)
 */
// ===== 类型 =====

export interface SttResult {
  text: string;
  confidence: number;
  language: string;
}

export interface SttEngine {
  id: string;
  name: string;
  priority: number;
  /** 引擎是否可用 */
  checkAvailable: () => Promise<boolean>;
  /** 开始实时识别（返回临时结果） */
  startRecognition: (callbacks: SttCallbacks) => Promise<SttSession>;
  /** 离线识别（上传音频，返回完整文本） */
  transcribe?: (audioBlob: Blob, language?: string) => Promise<SttResult>;
}

export interface SttCallbacks {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export interface SttSession {
  stop: () => void;
  abort: () => void;
}

// ===== 引擎注册表 =====

export class SttEngineRegistry {
  private engines = new Map<string, SttEngine>();
  private static instance: SttEngineRegistry;

  static getInstance(): SttEngineRegistry {
    if (!SttEngineRegistry.instance) {
      SttEngineRegistry.instance = new SttEngineRegistry();
    }
    return SttEngineRegistry.instance;
  }

  register(engine: SttEngine): void {
    this.engines.set(engine.id, engine);
  }

  get(id: string): SttEngine | undefined {
    return this.engines.get(id);
  }

  list(): SttEngine[] {
    return Array.from(this.engines.values()).sort((a, b) => a.priority - b.priority);
  }

  async getBestAvailable(): Promise<SttEngine | null> {
    for (const engine of this.list()) {
      try {
        if (await engine.checkAvailable()) return engine;
      } catch {
        continue;
      }
    }
    return null;
  }
}

// ===== 内置引擎 =====

export const WebSpeechSttEngine: SttEngine = {
  id: 'web-speech',
  name: 'Web Speech (浏览器)',
  priority: 0,

  checkAvailable: async () => {
    return !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
  },

  startRecognition: async (callbacks) => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      callbacks.onError?.('浏览器不支持语音识别');
      return { stop: () => {}, abort: () => {} };
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) callbacks.onInterim?.(interim);
      if (final) callbacks.onFinal?.(final);
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' 和 'aborted' 不是致命错误
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        callbacks.onError?.(event.error);
      }
    };

    recognition.onend = () => callbacks.onEnd?.();

    recognition.start();

    return {
      stop: () => {
        try { recognition.stop(); } catch {}
      },
      abort: () => {
        try { recognition.abort(); } catch {}
      },
    };
  },
};

export function initSttRegistry(): void {
  const registry = SttEngineRegistry.getInstance();
  registry.register(WebSpeechSttEngine);
}
