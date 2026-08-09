/**
 * TTS Hook v6 — 纯本地模式（T7 移除云端）
 *
 * - 使用服务端本地 CosyVoice 合成（零成本、离线稳定、隐私不出本机）
 * - 服务端不可用时：显示「无法连接语音服务」，不发声
 * - AudioContext 预热（用户首次交互后）
 * - 可见错误反馈 + 手动重播
 * - 预创建的 <audio> DOM 元素绕过 autoplay 限制
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioContextManager } from '../../modules/voice/AudioContextManager';
import { useAudioLevelStore } from '../../shared/stores/useAudioLevelStore';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import { replayAudio } from './ttsLogic';

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
  /** 静音状态：true 时语音输出关闭（不合成不播放） */
  isMuted: boolean;
  /** 切换静音 */
  toggleMuted: () => void;
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
  // 静音开关（语音输出可关闭）：关闭时 speak 不触发合成、不播放（用户"不想听了"）
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try { return localStorage.getItem('arrodes.ttsMuted') === '1'; } catch { return false; }
  });

  // C7 修复：副作用移出 state updater（React 要求 updater 纯函数）
  // - 持久化 + 开启静音时停掉当前播放
  useEffect(() => {
    try { localStorage.setItem('arrodes.ttsMuted', isMuted ? '1' : '0'); } catch { /* ignore */ }
    if (isMuted) {
      audioRef.current?.pause();
      audioRef.current = null;
      setIsSpeaking(false);
    }
  }, [isMuted]);

  const toggleMuted = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

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
        setError('无法连接语音服务');
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

  // ---- 手动重播（C6 修复：本地 wav 也可重播，旧反向判断已移除） ----
  const replay = useCallback(() => {
    replayAudio(audioRef.current, (err) => {
      console.warn('[TTS] replay 失败:', err);
    });
  }, []);

  // ---- TTS 引擎（纯本地 CosyVoice；云端已移除） ----
  const speakServer = useCallback(async (text: string): Promise<void> => {
    // 纯本地引擎：零成本、离线稳定、隐私不出本机。重试由服务端内置（指数退避 5 次）。
    const engine = 'local';
    let lastErr: unknown = null;

    // 合成 + 播放单次尝试（返回 base64 数据）
    const trySynthesize = async (voiceId: string, promptWav?: string, promptText?: string) => {
      const res = await fetch('/api/v1/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: voiceId,
          rate: config.rate,
          pitch: config.pitch,
          engine,
          ...(promptWav ? { promptWav, promptText } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `TTS ${res.status}` }));
        throw new Error(err.error || `TTS ${res.status}`);
      }
      const data = await res.json();
      if (!data.audioBase64) throw new Error('服务端返回的音频为空');
      return data;
    };

    try {
      // T9 自定义音色：voice 为 custom:xxx 时，查询参考音频路径传给服务端（zero-shot 克隆）
      let promptWav: string | undefined;
      let promptText: string | undefined;
      const isCustom = currentVoice.startsWith('custom:');
      if (isCustom) {
        const customId = currentVoice.replace('custom:', '');
        try {
          const vres = await fetch('/api/v1/tts/custom-voices');
          const vdata = await vres.json();
          const found = (vdata.voices || []).find((v: { id: string; path: string }) => v.id === customId);
          if (found) {
            promptWav = found.path;
            promptText = '你好，我是你的专属语音助手。'; // 参考音频配套提示文本
          }
        } catch { /* 查不到则回退默认音色 */ }
      }

      let data: { audioBase64: string; contentType: string };
      try {
        data = await trySynthesize(currentVoice, promptWav, promptText);
      } catch (err) {
        if (isCustom) {
          // 1.2 自定义音色失败 → 自动回退默认音色（HoloJarvis 借鉴：克隆音不可用回退系统音）
          console.warn('[TTS] 自定义音色合成失败，回退默认音色:', err instanceof Error ? err.message : err);
          data = await trySynthesize('default');
        } else {
          throw err;
        }
      }

      const audio = audioRef.current;
      if (!audio) throw new Error('audio 元素未就绪');

      await new Promise<void>((resolve, reject) => {
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
        return; // 播放成功
      } catch (err) {
        lastErr = err;
        console.warn('[TTS] 本地语音引擎失败:', err instanceof Error ? err.message : err);
      }
    throw lastErr instanceof Error ? lastErr : new Error('本地语音引擎不可用');
  }, [currentVoice, config.rate, config.pitch]);

  // ---- 主 speak 方法（代际计数器防旧音频残留） ----
  const generationRef = useRef(0);
  const speak = useCallback(async (text: string) => {
    if (!text || !text.trim()) return;
    // 静音模式：不触发语音合成、不播放（只保留文字展示）
    if (isMuted) return;
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
      console.warn('[TTS] 本地语音失败:', msg);
      // 纯本地模式：不发声，只提示
      if (gen === generationRef.current) {
        setError('无法连接语音服务');
      }
    }
  }, [speakServer, stop, isMuted]);

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
    isMuted,
    toggleMuted,
  };
}