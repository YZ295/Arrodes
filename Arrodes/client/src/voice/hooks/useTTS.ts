/**
 * TTS Hook v5 — 纯云端模式
 *
 * - 只使用服务端 Edge TTS，无本地 Web Speech 降级
 * - 云端不可用时：显示「无法连接云端语音服务」，不发声
 * - AudioContext 预热（用户首次交互后）
 * - 可见错误反馈 + 手动重播
 * - 预创建的 <audio> DOM 元素绕过 autoplay 限制
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioContextManager } from '../../modules/voice/AudioContextManager';
import { useAudioLevelStore } from '../../shared/stores/useAudioLevelStore';
import { eventBus, EVENTS } from '../../shared/events/EventBus';

// ===== 类型 =====

export type TtsEngine = 'server';

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
  engine: 'server',
  voiceId: 'zh-CN-XiaoxiaoNeural',
  rate: 1.0,
  pitch: 1.0,
};

// ===== Hook =====

export function useTTS(): UseTtsReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentVoice, setCurrentVoice] = useState(DEFAULT_CONFIG.voiceId);
  const [config, setConfigState] = useState<TtsConfig>(DEFAULT_CONFIG);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
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

    audio.onplay = () => { setIsSpeaking(true); startLevelMonitor(); eventBus.emit(EVENTS.TTS_PLAY_START); };
    audio.onended = () => { setIsSpeaking(false); stopLevelMonitor(); eventBus.emit(EVENTS.TTS_PLAY_END); };
    audio.onpause = () => { setIsSpeaking(false); stopLevelMonitor(); eventBus.emit(EVENTS.TTS_PLAY_END); };
    audio.onerror = () => { setIsSpeaking(false); stopLevelMonitor(); eventBus.emit(EVENTS.TTS_PLAY_END); };

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
      }
    } catch {
      /* ignore */
    }
  }, []);

  // ---- 加载服务端音色列表 ----
  useEffect(() => {
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
        setError('无法连接云端语音服务');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 更新配置 ----
  const setConfig = useCallback((partial: Partial<TtsConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...partial };
      if (partial.voiceId) setCurrentVoice(partial.voiceId);
      try { localStorage.setItem('arrodes_tts_config', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ---- 恢复偏好 ----
  useEffect(() => {
    try {
      const saved = localStorage.getItem('arrodes_tts_config');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<TtsConfig>;
        setConfigState((prev) => ({ ...prev, ...parsed }));
        if (parsed.voiceId) setCurrentVoice(parsed.voiceId);
      }
    } catch {}
  }, []);

  // ---- 停止播放（同时清 audio） ----
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      audio.load();
    }
    setIsSpeaking(false);
    useAudioLevelStore.getState().setOutputLevel(0);
    useAudioLevelStore.getState().setMode('idle');
    if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null; }
  }, []);

  // ---- 手动重播 ----
  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.src && !audio.src.includes('data:audio/wav')) {
      audio.currentTime = 0;
      audio.play().catch((err) => {
        console.warn('[TTS] replay 失败:', err);
      });
    }
  }, []);

  // ---- 云端 TTS（Edge TTS 服务端合成） ----
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

  // ---- 主 speak 方法（代际计数器防旧音频残留） ----
  const generationRef = useRef(0);
  const speak = useCallback(async (text: string) => {
    if (!text || !text.trim()) return;
    setError(null);
    lastTextRef.current = text;

    // 中断前一代音频
    stop();
    generationRef.current++;
    const gen = generationRef.current;

    try {
      await speakServer(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.warn('[TTS] 云端语音失败:', msg);
      // 纯云端模式：不发声，只提示
      if (gen === generationRef.current) {
        setError('无法连接云端语音服务');
      }
    }
  }, [speakServer, stop]);

  // ---- 卸载清理 ----
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    isSpeaking,
    engine: 'server',
    currentVoice,
    config,
    voices,
    speak,
    stop,
    setConfig,
    available: true,
    error,
    unlockAudio,
    replay,
  };
}