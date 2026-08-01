/**
 * 语音聊天 Hook v4.4
 * 多会话管理 + STT Promise 竞态修复 + 管道编排
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Message, SessionNode, WSChunkData, WSCompleteData, WSMemoryData } from '@shared/types';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import { useUniverseStore } from '../../shared/stores/useUniverseStore';
import { calcSpawnPosition } from '../../universe/utils/spawnPosition';
import { uid } from '../../shared/utils/uid';
import { api } from '../../shared/utils/apiClient';
import { MessageChannel, useMessageChannel } from '../../core/MessageChannel';
import { createVoicePipeline } from '../../pipeline/voicePipeline';
import { useAudioRecorder } from './useAudioRecorder';
import { useSpeechToText } from './useSpeechToText';
import { useTTS } from './useTTS';

interface UseVoiceChatReturn {
  messages: Message[];
  isRecording: boolean;
  recordingDuration: number;
  recordingVolume: number;
  isLoading: boolean;
  isConnected: boolean;
  currentSessionId: string | null;
  interimText: string;
  isSpeaking: boolean;
  isMuted: boolean;
  error: string | null;
  showMemoryToast: boolean;
  memoryToastText: string;
  startRecording: () => void;
  stopRecording: () => void;
  sendTextMessage: (text: string) => void;
  switchSession: (sessionId: string) => void;
  createNewSession: (title?: string) => Promise<string | null>;
  /** TTS 错误信息（如果有） */
  ttsError: string | null;
  /** 手动重播最近一段语音 */
  replayTTS: () => void;
  /** 解锁音频（首次交互后调用） */
  unlockAudio: () => Promise<void>;
  /** 当前 TTS 配置 */
  ttsConfig: { engine: string; voiceId: string; rate: number; pitch: number };
  /** 可用音色列表 */
  ttsVoices: Array<{ id: string; name: string; gender: string; style: string }>;
  /** 实时更新 TTS 配置（立即生效） */
  setTtsConfig: (config: Partial<{ engine: 'server' | 'web'; voiceId: string; rate: number; pitch: number }>) => void;
}

export function useVoiceChat(): UseVoiceChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showMemoryToast, setShowMemoryToast] = useState(false);
  const [memoryToastText, setMemoryToastText] = useState('');

  const channel = useMemo(() => MessageChannel.getInstance(), []);
  const { state: channelState } = useMessageChannel();
  const { speak: ttsSpeak, stop: ttsStop, isSpeaking: ttsSpeaking, error: ttsError, replay: replayTTS, unlockAudio, config: ttsConfig, voices: ttsVoices, setConfig: setTtsConfigRaw } = useTTS();
  const pipeline = useMemo(() => createVoicePipeline({ ttsSpeak }), [ttsSpeak]);

  const recordingSessionId = useRef<string | null>(null);
  const hasInitialized = useRef(false);
  const sttPromiseRef = useRef<Promise<string> | null>(null);

  const {
    isRecording, duration: recordingDuration, volume: recordingVolume,
    startRecording: startAudioRecorder, stopRecording: stopAudioRecorder,
    error: recorderError,
  } = useAudioRecorder();

  const {
    interimText, startListening: startStt, stopListening: stopStt, error: sttError,
  } = useSpeechToText();

  useEffect(() => { if (recorderError) console.warn('[VoiceChat] 录音器异常:', recorderError); }, [recorderError]);
  useEffect(() => { if (sttError) console.warn('[VoiceChat] 语音识别异常:', sttError); }, [sttError]);

  // ---- 消息加载 ----
  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const data = await api.get<{ messages?: Message[] }>(`/messages/${sessionId}`);
      if (data.messages) setMessages(data.messages);
    } catch {
      /* 静默降级 */
    }
  }, []);

  // ---- 会话初始化：加载/创建第一个有效会话 ----
  const initSession = useCallback(async () => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    try {
      const data = await api.get<{ sessions: SessionNode[] }>('/sessions');
      const sessions = data.sessions || [];
      useUniverseStore.getState().setPlanets(sessions);
      const valid = sessions.filter((s) => s.messageCount > 0);

      if (valid.length > 0) {
        // 加载第一个有效会话
        const first = valid[0];
        setCurrentSessionId(first.id);
        recordingSessionId.current = first.id;
        loadMessages(first.id);
      } else {
        // 无历史 → 创建默认会话
        const session = await api.post<SessionNode>('/sessions', { title: '新对话', topic: 'other' });
        setCurrentSessionId(session.id);
        recordingSessionId.current = session.id;
      }
    } catch {
      const tmpId = uid();
      setCurrentSessionId(tmpId);
      recordingSessionId.current = tmpId;
    }
  }, [loadMessages]);

  useEffect(() => {
    setIsConnected(channelState === 'connected');
    if (channelState === 'connected') initSession();
  }, [channelState, initSession]);

  // ---- MessageChannel 回调 ----
  const handleChunk = useCallback((data: WSChunkData) => {
    if (!data.content) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && !last.id.endsWith('-done')) {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, content: last.content + data.content };
        return updated;
      }
      return [...prev, { id: uid(), role: 'assistant', content: data.content, timestamp: new Date().toISOString(), isVoice: false }];
    });
  }, []);

  const handleComplete = useCallback((data: WSCompleteData) => {
    setIsLoading(false);
    if (!data.content) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...last, id: last.id + '-done', content: data.content };
      return updated;
    });
    eventBus.emit(EVENTS.VOICE_REPLY_COMPLETE, { content: data.content, sessionId: recordingSessionId.current });
  }, []);

  const handleMemory = useCallback((data: WSMemoryData) => {
    if (data.memories?.length) {
      setShowMemoryToast(true);
      setMemoryToastText(`${data.memories.length} 条记忆已存储`);
      setTimeout(() => setShowMemoryToast(false), 3000);
    }
  }, []);

  const handleError = useCallback((error: string) => {
    setIsLoading(false);
    setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: `⚠️ ${error || '发生未知错误'}`, timestamp: new Date().toISOString(), isVoice: false }]);
  }, []);

  useEffect(() => {
    channel.setCallbacks({ onChunk: handleChunk, onComplete: handleComplete, onMemory: handleMemory, onError: handleError });
  }, [channel, handleChunk, handleComplete, handleMemory, handleError]);

  useEffect(() => { setIsSpeaking(ttsSpeaking); }, [ttsSpeaking]);

  // ---- 切换会话 ----
  const switchSession = useCallback((sessionId: string) => {
    if (sessionId === currentSessionId) return;
    setCurrentSessionId(sessionId);
    recordingSessionId.current = sessionId;
    setMessages([]);
    loadMessages(sessionId);
  }, [currentSessionId, loadMessages]);

  // ---- 创建新会话 ----
  const createNewSession = useCallback(async (title = '新会话'): Promise<string | null> => {
    try {
      const session = await api.post<SessionNode>('/sessions', { title, topic: 'other' });
      const { planets, addPlanet } = useUniverseStore.getState();
      const nonHomeCount = planets.filter((p) => !p.isHome).length;
      const position = calcSpawnPosition(nonHomeCount);
      addPlanet({ ...session, messageCount: session.messageCount || 1 }, position);
      switchSession(session.id);
      return session.id;
    } catch (err) {
      console.error('[VoiceChat] 创建会话失败:', err);
      return null;
    }
  }, [switchSession]);

  // ---- 事件驱动：会话切换 ----
  useEffect(() => {
    const u1 = eventBus.on(EVENTS.VOICE_SESSION_SWITCH, (data: unknown) => {
      const { sessionId } = (data as { sessionId: string }) || {};
      if (sessionId) switchSession(sessionId);
    });
    return u1;
  }, [switchSession]);

  // ---- 事件驱动：新建会话 ----
  useEffect(() => {
    const u2 = eventBus.on(EVENTS.VOICE_SESSION_CREATE, (data: unknown) => {
      const { title } = (data as { title?: string }) || {};
      createNewSession(title);
    });
    return u2;
  }, [createNewSession]);

  // ---- 发送消息 ----
  const sendMessage = useCallback((content: string, isVoice: boolean) => {
    const sessionId = recordingSessionId.current;
    if (!sessionId || !channel.isConnected()) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'user', content, timestamp: new Date().toISOString(), isVoice },
        { id: uid(), role: 'assistant', content: '⚠️ 无法连接到服务器', timestamp: new Date().toISOString(), isVoice: false },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { id: uid(), role: 'user', content, timestamp: new Date().toISOString(), isVoice }]);
    setIsLoading(true);

    eventBus.emit(EVENTS.VOICE_MESSAGE_SEND, { content, sessionId, isVoice });
    pipeline.run(content, sessionId, isVoice).catch((err) => {
      console.warn('[VoiceChat] 管道执行失败:', err);
      setIsLoading(false);
    });
  }, [channel, pipeline]);

  const sendTextMessage = useCallback((text: string) => sendMessage(text, false), [sendMessage]);

  // ---- 录制 ----
  const startRecording = useCallback(() => {
    startAudioRecorder().catch(() => {});
    // Electron 壳内浏览器 SpeechRecognition 不可用（报 network 错误），
    // 直接跳过实时 STT，靠 stopRecording 时的录音上传服务端识别。
    const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
    sttPromiseRef.current = isElectron ? Promise.resolve('') : startStt().catch(() => '');
    eventBus.emit(EVENTS.VOICE_RECORDING_START);
  }, [startAudioRecorder, startStt]);

  // ---- 服务端语音识别（录音 Blob 上传）----
  const serverTranscribe = useCallback(async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
    const res = await fetch('/api/v1/stt/transcribe', { method: 'POST', body: form });
    if (!res.ok) throw new Error(`服务端语音识别失败 (${res.status})`);
    const data = await res.json() as { text?: string };
    return (data.text || '').trim();
  }, []);

  // 回退：浏览器实时 STT 结果（无则占位文本）
  const fallbackToStt = useCallback((sttPromise: Promise<string> | null, fallback: (text: string) => void) => {
    (sttPromise || Promise.resolve('')).then((sttText) => {
      const text = sttText && sttText.length > 2 ? sttText : '[语音消息]';
      fallback(text);
    });
  }, []);

  const stopRecording = useCallback(() => {
    const sttPromise = sttPromiseRef.current;
    sttPromiseRef.current = null;
    stopStt();

    // 结束录音并拿到 Blob（服务端 STT 用；浏览器实时 STT 结果作兜底）
    stopAudioRecorder().then((audioBlob) => {
      const fallback = (text: string) => {
        sendMessage(text, true);
        eventBus.emit(EVENTS.VOICE_RECORDING_END, { text, sessionId: currentSessionId });
      };

      if (audioBlob && audioBlob.size > 0) {
        serverTranscribe(audioBlob)
          .then((text) => {
            if (text) { fallback(text); return; }
            fallbackToStt(sttPromise, fallback);
          })
          .catch((err) => {
            console.warn('[VoiceChat] 服务端识别失败，回退浏览器 STT:', err);
            fallbackToStt(sttPromise, fallback);
          });
      } else {
        fallbackToStt(sttPromise, fallback);
      }
    });
  }, [stopAudioRecorder, stopStt, sendMessage, currentSessionId, serverTranscribe]);

  useEffect(() => () => { ttsStop(); }, [ttsStop]);

  return {
    messages, isRecording, recordingDuration, recordingVolume,
    isLoading, isConnected, currentSessionId, interimText,
    isSpeaking, isMuted: false, error: recorderError || sttError || null,
    showMemoryToast, memoryToastText,
    startRecording, stopRecording, sendTextMessage,
    switchSession, createNewSession,
    ttsError, replayTTS, unlockAudio,
    ttsConfig: { engine: ttsConfig.engine, voiceId: ttsConfig.voiceId, rate: ttsConfig.rate, pitch: ttsConfig.pitch },
    ttsVoices, setTtsConfig: setTtsConfigRaw,
  };
}
