/**
 * TTS Hook v4.4
 * - 服务端 Edge TTS 优先 + Web Speech 降级
 * - AudioContext 预热（用户首次交互后）
 * - 可见错误反馈 + 手动重播
 * - 预创建的 <audio> DOM 元素绕过 autoplay 限制
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioContextManager } from '../../modules/voice/AudioContextManager';
import { useAudioLevelStore } from '../../shared/stores/useAudioLevelStore';

// ===== 类型 =====

export type TtsEngine = 'server' | 'web';

export interface TtsVoice {
  id: string;
  name: string;
  gender: string;
  style: string;
}

export interface TtsConfig {
  engine: TtsEngine;
  voiceId: string;
  rate: number;
  pitch: number;
}

interface UseTtsReturn {
  isSpeaking: boolean;
  engine: TtsEngine;
  currentVoice: string;
  config: TtsConfig;
  voices: TtsVoice[];
  speak: (text: string) => Promise<void>;
  stop: () => void;
  setConfig: (config: Partial<TtsConfig>) => void;
  available: boolean;
  error: string | null;
  /** 用户首次交互后调用，解锁浏览器 autoplay */
  unlockAudio: () => Promise<void>;
  /** 手动重播最近一段语音 */
  replay: () => void;
}

// ===== 默认配置 =====

const DEFAULT_CONFIG: TtsConfig = {
  engine: 'web', // 默认用浏览器内置 Web Speech（Edge TTS 经常因 token 失效返回 401）
  voiceId: 'zh-CN',
  rate: 1.0,
  pitch: 1.0,
};

// ===== Hook =====

export function useTTS(): UseTtsReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [engine, setEngine] = useState<TtsEngine>('server');
  const [currentVoice, setCurrentVoice] = useState(DEFAULT_CONFIG.voiceId);
  const [config, setConfigState] = useState<TtsConfig>(DEFAULT_CONFIG);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [available] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTextRef = useRef<string>('');
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- 创建持久化的 <audio> DOM 元素 + 音量分析 ----
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.style.display = 'none';
    document.body.appendChild(audio);
    audioRef.current = audio;

    const startLevelMonitor = () => {
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
      useAudioLevelStore.getState().setMode('speaking');
      const data = new Uint8Array(analyserRef.current?.frequencyBinCount || 128);
      levelTimerRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        useAudioLevelStore.getState().setOutputLevel(Math.floor(sum / data.length));
      }, 50);
    };

    const stopLevelMonitor = () => {
      if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null; }
      useAudioLevelStore.getState().setOutputLevel(0);
      useAudioLevelStore.getState().setMode('idle');
    };

    audio.onplay = () => { setIsSpeaking(true); startLevelMonitor(); };
    audio.onended = () => { setIsSpeaking(false); stopLevelMonitor(); };
    audio.onpause = () => { setIsSpeaking(false); stopLevelMonitor(); };
    audio.onerror = () => { setIsSpeaking(false); stopLevelMonitor(); };

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.remove();
      stopLevelMonitor();
      try { sourceNodeRef.current?.disconnect(); } catch {}
    };
  }, []);

  // ---- 解锁音频 + 初始化 Analyser（用户首次交互后调用）----
  const unlockAudio = useCallback(async () => {
    try {
      const acm = AudioContextManager.getInstance();
      await acm.ensureResumed();

      // 首次解锁时同时建立音频分析图
      if (!analyserRef.current && audioRef.current) {
        const ctx = acm.getContext();
        const source = ctx.createMediaElementSource(audioRef.current);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        sourceNodeRef.current = source;
        analyserRef.current = analyser;
        console.log('%c[TTS] %cAnalyserNode 已建立', 'color:#10b981', 'color:inherit');
      }
    } catch {
      /* ignore */
    }
  }, []);

  // ---- 加载音色列表（Web Speech 从浏览器获取，Edge TTS 从服务端获取） ----
  useEffect(() => {
    if (engine === 'server') {
      fetch('/api/v1/tts/voices')
        .then((r) => r.json())
        .then((data) => {
          if (data.voices) {
            setVoices(data.voices);
            if (!data.voices.find((v: TtsVoice) => v.id === currentVoice)) {
              setCurrentVoice(data.voices[0]?.id || 'zh-CN-YunyangNeural');
            }
          }
        })
        .catch(() => {
          setEngine('web');
          setError('服务端 TTS 不可用，使用浏览器内置语音');
        });
    } else {
      const loadWebVoices = () => {
        const all = window.speechSynthesis.getVoices();
        if (all.length === 0) { setTimeout(loadWebVoices, 200); return; }
        const zhVoices = all
          .filter((v) => v.lang.startsWith('zh'))
          .map((v) => ({
            id: v.voiceURI,
            name: `${v.name}`,
            gender: v.name.includes('Xiao') || v.name.includes('xiaoxiao') ? 'female' : 'male',
            style: v.name,
          }));
        setVoices(zhVoices.length > 0 ? zhVoices : all.map((v) => ({
          id: v.voiceURI, name: v.name, gender: 'other', style: v.name,
        })));
      };
      loadWebVoices();
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = loadWebVoices;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]); // 只在 engine 切换时重新加载，不因 currentVoice 变化触发

  // ---- 更新配置 ----
  const setConfig = useCallback((partial: Partial<TtsConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...partial };
      if (partial.voiceId) setCurrentVoice(partial.voiceId);
      if (partial.engine) setEngine(partial.engine);
      try { localStorage.setItem('arrodes_tts_config', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ---- 恢复偏好（Edge TTS 当前 401，老用户强制升级到 web） ----
  useEffect(() => {
    try {
      const saved = localStorage.getItem('arrodes_tts_config');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<TtsConfig>;
        // Edge TTS 的 TRUSTED_CLIENT_TOKEN 经常被微软拒绝，强制改用 Web Speech
        const engine: TtsEngine = parsed.engine === 'server' ? 'web' : (parsed.engine ?? 'web');
        const migrated: TtsConfig = { ...DEFAULT_CONFIG, ...parsed, engine };
        setConfigState((prev) => ({ ...prev, ...migrated }));
        if (parsed.voiceId) setCurrentVoice(parsed.voiceId);
        setEngine(engine);
        // 写回 localStorage
        try { localStorage.setItem('arrodes_tts_config', JSON.stringify(migrated)); } catch {}
      }
    } catch {}
  }, []);

  // ---- 停止播放 ----
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  // ---- 手动重播 ----
  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.src && !audio.src.includes('data:audio/wav')) {
      audio.currentTime = 0;
      audio.play().catch((err) => {
        console.warn('[TTS] replay 失败:', err);
      });
    } else if (lastTextRef.current) {
      // 重播 Web Speech
      window.speechSynthesis?.cancel();
      const utterance = new SpeechSynthesisUtterance(lastTextRef.current);
      utterance.lang = 'zh-CN';
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      window.speechSynthesis.speak(utterance);
    }
  }, [config.rate, config.pitch]);

  // ---- 服务端 TTS ----
  const speakServer = useCallback(async (text: string): Promise<void> => {
    const res = await fetch('/api/v1/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: currentVoice,
        rate: config.rate,
        pitch: config.pitch,
        engine: 'edge',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `TTS ${res.status}` }));
      throw new Error(err.error || `TTS ${res.status}`);
    }

    const data = await res.json();
    if (!data.audioBase64) {
      throw new Error('服务端返回的音频为空');
    }

    const audio = audioRef.current;
    if (!audio) throw new Error('audio 元素未就绪');

    return new Promise((resolve, reject) => {
      audio.onended = () => { setIsSpeaking(false); resolve(); };
      audio.onerror = () => {
        setIsSpeaking(false);
        reject(new Error('音频播放失败（autoplay 被拦截或音频损坏）'));
      };
      audio.src = `data:${data.contentType || 'audio/mpeg'};base64,${data.audioBase64}`;
      audio.play().catch((err) => {
        setIsSpeaking(false);
        reject(new Error(`play() 失败: ${err.message || err}`));
      });
    });
  }, [currentVoice, config.rate, config.pitch]);

  // ---- Web Speech ----
  const speakWeb = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;

      // 多重匹配策略（按优先级）：
      // 1. 精确匹配 voiceURI
      // 2. 中文 + 名字包含关键词（如"云扬"/"Yunyang"=男声）
      // 3. 任意中文语音
      const voices = window.speechSynthesis.getVoices();
      const exact = voices.find((v) => v.voiceURI === currentVoice);
      const byKeyword = voices.find((v) =>
        v.lang.startsWith('zh') && (
          currentVoice.toLowerCase().includes('yunyang') || currentVoice.toLowerCase().includes('yunjian')
            ? v.name.toLowerCase().includes('yun')
            : currentVoice.toLowerCase().includes('xiaoxiao') || currentVoice.toLowerCase().includes('xiaoyi') || currentVoice.toLowerCase().includes('xiaorou')
              ? v.name.toLowerCase().includes('xiao')
              : false
        )
      );
      const anyZh = voices.find((v) => v.lang.startsWith('zh'));
      utterance.voice = exact || byKeyword || anyZh || voices[0] || null;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }, [currentVoice, config.rate, config.pitch]);

  // ---- 主 speak 方法 ----
  const speak = useCallback(async (text: string) => {
    if (!text || !text.trim()) return;
    setError(null);
    lastTextRef.current = text;

    try {
      if (engine === 'server') {
        try {
          await speakServer(text);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          console.warn('[TTS] 服务端失败 → 降级:', msg);
          setEngine('web');
          setError(`服务端 TTS 失败 (${msg})，已降级到浏览器语音`);
        }
      }
      await speakWeb(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS 播放失败';
      console.error('[TTS] 最终失败:', msg);
      setError(msg);
      setIsSpeaking(false);
    }
  }, [engine, speakServer, speakWeb]);

  // ---- 卸载清理 ----
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    isSpeaking,
    engine,
    currentVoice,
    config,
    voices,
    speak,
    stop,
    setConfig,
    available,
    error,
    unlockAudio,
    replay,
  };
}