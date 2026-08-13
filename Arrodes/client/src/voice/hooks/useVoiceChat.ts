/**
 * 语音聊天 Hook v5（T10 重构：组合式）
 *
 * 拆分自 v4.4 巨型 hook：
 * - useSessionManager：会话/消息/切换/新建
 * - useVoiceRecorder：录音/STT/转录回退
 * - useTTS：语音合成/静音
 * 本文件只保留：TTS 编排、WS 事件订阅、管道触发、停止机制。
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { WSChunkData, WSCompleteData, WSMemoryData } from '@shared/types';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import { uid } from '../../shared/utils/uid';
import { bumpVoiceGeneration } from '../../shared/utils/voiceGeneration';
import { MessageChannel, useMessageChannel } from '../../core/MessageChannel';
import { createVoicePipeline } from '../../pipeline/voicePipeline';
import { useTTS } from './useTTS';
import { useSessionManager } from './useSessionManager';
import { useVoiceRecorder } from './useVoiceRecorder';

interface UseVoiceChatReturn {
  messages: import('@shared/types').Message[];
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
  /** 停止当前 TTS 播放 */
  stopTTS: () => void;
  /** 完整停止：停语音 + 停 LLM 思考 + 停任务执行（用户真实意图：不想再听） */
  stopAll: () => void;
  /** 追加一条助手消息（供确认弹窗回填执行结果） */
  appendAssistantMessage: (content: string) => void;
  /** 静音开关：关闭语音输出（不合成不播放） */
  toggleMuted: () => void;
  /** 解锁音频（首次交互后调用） */
  unlockAudio: () => Promise<void>;
  /** 当前 TTS 配置 */
  ttsConfig: { engine: string; voiceId: string; rate: number; pitch: number };
  /** 可用音色列表 */
  ttsVoices: Array<{ id: string; name: string; gender: string; style: string }>;
  /** 实时更新 TTS 配置（立即生效） */
  setTtsConfig: (config: Partial<{ engine: 'server'; voiceId: string; rate: number; pitch: number }>) => void;
}

export function useVoiceChat(): UseVoiceChatReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showMemoryToast, setShowMemoryToast] = useState(false);
  const [memoryToastText, setMemoryToastText] = useState('');

  const channel = useMemo(() => MessageChannel.getInstance(), []);
  const { state: channelState } = useMessageChannel();
  const { speak: ttsSpeak, stop: ttsStop, isSpeaking: ttsSpeaking, error: ttsError, replay: replayTTS, unlockAudio, config: ttsConfig, voices: ttsVoices, setConfig: setTtsConfigRaw, isMuted: ttsMuted, toggleMuted: ttsToggleMuted } = useTTS();
  const pipeline = useMemo(() => createVoicePipeline({ ttsSpeak }), [ttsSpeak]);

  // 会话管理（T10 拆分）
  const {
    messages, currentSessionId, setMessages, initSession, switchSession, createNewSession,
  } = useSessionManager();

  // 当前对话任务的取消控制器（停止机制核心：abort → 停 LLM 等待 + 发 cancel 给服务端）
  const abortRef = useRef<AbortController | null>(null);
  // 当前会话 id 的 ref 同步（供 recorder/发送归属）
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = currentSessionId; }, [currentSessionId]);

  // ---- 发送消息（自动中断正在播放的语音 + 取消上一个任务） ----
  const sendMessage = useCallback((content: string, isVoice: boolean) => {
    // 递增代际 + 中断当前 TTS 播放（新消息取代旧消息）
    const generation = bumpVoiceGeneration();
    ttsStop();
    // 新消息 = 全新的开始：取消上一个还在跑的 LLM 任务
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId || !channel.isConnected()) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'user', content, timestamp: new Date().toISOString(), isVoice },
        { id: uid(), role: 'assistant', content: '⚠️ 无法连接到服务器', timestamp: new Date().toISOString(), isVoice: false },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { id: uid(), role: 'user', content, timestamp: new Date().toISOString(), isVoice }]);
    setIsLoading(true);

    eventBus.emit(EVENTS.VOICE_MESSAGE_SEND, { content, sessionId: activeSessionId, isVoice });
    pipeline.run(content, activeSessionId, isVoice, generation, controller.signal).catch((err) => {
      // 用户主动停止不算错误
      if (err instanceof Error && err.message === 'cancelled') {
        console.log('[VoiceChat] 已按用户指令停止');
      } else {
        console.warn('[VoiceChat] 管道执行失败:', err);
      }
      setIsLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    });
  }, [channel, pipeline, ttsStop, setMessages]);

  // 录音（T10 拆分；sendMessage 回调注入）
  const recorder = useVoiceRecorder({
    sendMessage,
    getSessionId: () => sessionIdRef.current,
  });

  // ---- WS 事件回调 ----
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
  }, [setMessages]);

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
    eventBus.emit(EVENTS.VOICE_REPLY_COMPLETE, { content: data.content, sessionId: sessionIdRef.current });
  }, [setMessages]);

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
  }, [setMessages]);

  // 订阅 MessageChannel 全局回调 + 连接状态
  useEffect(() => {
    channel.setCallbacks({ onChunk: handleChunk, onComplete: handleComplete, onMemory: handleMemory, onError: handleError });
  }, [channel, handleChunk, handleComplete, handleMemory, handleError]);

  useEffect(() => {
    setIsConnected(channelState === 'connected');
    if (channelState === 'connected') initSession();
  }, [channelState, initSession]);

  useEffect(() => { setIsSpeaking(ttsSpeaking); }, [ttsSpeaking]);

  // ---- 完整停止：停语音 + 停 LLM 思考 + 停任务执行 ----
  const stopAll = useCallback(() => {
    // 1. 立即停语音播放
    ttsStop();
    // 2. 取消 LLM 推理（前端 Promise reject + WS 发 cancel 给服务端中断流）
    abortRef.current?.abort();
    abortRef.current = null;
    // 3. 清理 loading 态（AI 不再继续输出）
    setIsLoading(false);
    console.log('[VoiceChat] 已完整停止：语音已停、推理已中断');
  }, [ttsStop]);

  const sendTextMessage = useCallback((text: string) => sendMessage(text, false), [sendMessage]);

  // 追加助手消息（确认弹窗执行后回填结果，不触发新的 LLM 流程）
  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: 'assistant', content, timestamp: new Date().toISOString(), isVoice: false },
    ]);
  }, [setMessages]);

  // 卸载清理
  useEffect(() => () => { ttsStop(); }, [ttsStop]);

  return {
    messages,
    isRecording: recorder.isRecording,
    recordingDuration: recorder.recordingDuration,
    recordingVolume: recorder.recordingVolume,
    isLoading,
    isConnected,
    currentSessionId,
    interimText: recorder.interimText,
    isSpeaking,
    isMuted: ttsMuted,
    error: recorder.error,
    showMemoryToast,
    memoryToastText,
    startRecording: recorder.startRecording,
    stopRecording: recorder.stopRecording,
    sendTextMessage,
    switchSession,
    createNewSession,
    ttsError,
    replayTTS,
    unlockAudio,
    stopTTS: ttsStop,
    stopAll,
    appendAssistantMessage,
    toggleMuted: ttsToggleMuted,
    ttsConfig: { engine: ttsConfig.engine, voiceId: ttsConfig.voiceId, rate: ttsConfig.rate, pitch: ttsConfig.pitch },
    ttsVoices,
    setTtsConfig: setTtsConfigRaw,
  };
}
