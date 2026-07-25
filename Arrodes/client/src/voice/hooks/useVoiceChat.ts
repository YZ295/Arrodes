/**
 * 语音聊天 Hook
 * 管理 WebSocket 连接、消息状态、录制、STT/TTS 和消息加载
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import type { Message, WSClientMessage, WSServerMessage, SessionNode } from '@shared/types';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import { useUniverseStore } from '../../shared/stores/useUniverseStore';
import { calcSpawnPosition } from '../../universe/utils/spawnPosition';
import { useAudioRecorder } from './useAudioRecorder';
import { useSpeechToText } from './useSpeechToText';
import {
  detectIntent,
  isLocalOnlyIntent,
  isEventDrivenIntent,
  getIntentLocalReply
} from '../utils/intentDetector';

interface UseVoiceChatReturn {
  messages: Message[];
  isRecording: boolean;
  isLoading: boolean;
  isConnected: boolean;
  currentSessionId: string | null;
  interimText: string;
  isSpeaking: boolean;
  isMuted: boolean;
  error: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  sendTextMessage: (text: string) => void;
}

// 简易 ID 生成
function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// TTS: 语音合成
function speakText(text: string, onStart?: () => void, onEnd?: () => void): void {
  if (!window.speechSynthesis) return;
  // 取消之前正在播放的
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // 尝试选择中文语音
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find((v) => v.lang.startsWith('zh'));
  if (zhVoice) utterance.voice = zhVoice;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
}

export function useVoiceChat(): UseVoiceChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recordingSessionId = useRef<string | null>(null);
  const hasLoadedHistory = useRef(false);
  const lastSpokenContent = useRef<string>('');
  const hasInitializedSession = useRef(false);
  const reconnectAttempt = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    isRecording,
    startRecording: startAudioRecorder,
    stopRecording: stopAudioRecorder,
    error: recorderError,
  } = useAudioRecorder();

  const {
    isListening: isSttListening,
    interimText,
    startListening: startStt,
    stopListening: stopStt,
    error: sttError,
  } = useSpeechToText();

  // 录音错误监控
  useEffect(() => {
    if (recorderError) {
      console.warn('[VoiceChat] 录音器异常:', recorderError);
    }
  }, [recorderError]);

  // STT 错误监控
  useEffect(() => {
    if (sttError) {
      console.warn('[VoiceChat] 语音识别异常:', sttError);
    }
  }, [sttError]);

  // 加载消息历史
  const loadMessages = useCallback((sessionId: string) => {
    if (hasLoadedHistory.current) return;
    hasLoadedHistory.current = true;

    fetch(`/api/v1/messages/${sessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {
        // 静默降级
      });
  }, []);

  // 建立 WebSocket 连接
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_HOST || 'localhost:3001';
    const wsUrl = `${protocol}//${wsHost}/v1/chat`;
    let ws: WebSocket;
    let closed = false;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed) return;
        setIsConnected(true);
        reconnectAttempt.current = 0;

        if (!hasInitializedSession.current) {
          // 首次连接：先拉取已有会话列表
          hasInitializedSession.current = true;
          hasLoadedHistory.current = false;

          fetch('/api/v1/sessions')
            .then((r) => r.json())
            .then((data: { sessions: SessionNode[] }) => {
              const sessions = data.sessions || [];
              if (sessions.length > 0) {
                // 有历史会话：渲染星球，默认选中最新活跃的（第一条）
                const store = useUniverseStore.getState();
                store.setPlanets(sessions);
                const firstSession = sessions[0];
                setCurrentSessionId(firstSession.id);
                recordingSessionId.current = firstSession.id;
                loadMessages(firstSession.id);
              } else {
                // 无历史会话：兜底创建默认会话（系统行为，不自动切换相机）
                return fetch('/api/v1/sessions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: '新对话', topic: 'other' }),
                })
                  .then((r) => r.json())
                  .then((session: SessionNode) => {
                    const store = useUniverseStore.getState();
                    store.addPlanet(session, calcSpawnPosition(0));
                    setCurrentSessionId(session.id);
                    recordingSessionId.current = session.id;
                    loadMessages(session.id);
                  });
              }
            })
            .catch(() => {
              const tmpId = uid();
              setCurrentSessionId(tmpId);
              recordingSessionId.current = tmpId;
            });
        } else {
          // 重连：恢复已有 session
          hasLoadedHistory.current = false;
          if (currentSessionId) {
            loadMessages(currentSessionId);
          }
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // 指数退避重连: 3s -> 6s -> 12s -> max 30s
        const delay = Math.min(3000 * Math.pow(2, reconnectAttempt.current), 30000);
        reconnectAttempt.current++;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (closed) return;
        try {
          const serverMsg: WSServerMessage = JSON.parse(event.data as string);
          handleServerMessage(serverMsg);
        } catch {
          // 忽略解析失败的消息
        }
      };

      ws.onerror = () => {
        if (closed) return;
        ws.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // StrictMode 下 useEffect 会跑两次：
      // 第一次的 cleanup 会关闭还在 CONNECTING 的 WebSocket，
      // 导致 "closed before establishment" 报错。
      // 只在 OPEN/CLOSING 时关，CONNECTING 的让浏览器自己收尾。
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING)) {
        ws.close();
      }
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听会话切换事件（如通过语音新建会话后自动切换）
  useEffect(() => {
    const unsubscribe = eventBus.on(EVENTS.VOICE_SESSION_SWITCH, (data: unknown) => {
      const { sessionId } = (data as { sessionId: string }) || {};
      if (sessionId) {
        setCurrentSessionId(sessionId);
        recordingSessionId.current = sessionId;
        hasLoadedHistory.current = false;
        setMessages([]);
        loadMessages(sessionId);
      }
    });
    return unsubscribe;
  }, [loadMessages]);

  // 监听星球点击事件（用户手动切换会话）
  useEffect(() => {
    const unsubscribe = eventBus.on(EVENTS.UNIVERSE_PLANET_CLICK, (data: unknown) => {
      const { sessionId } = (data as { sessionId?: string }) || {};
      if (sessionId && sessionId !== 'home') {
        setCurrentSessionId(sessionId);
        recordingSessionId.current = sessionId;
        hasLoadedHistory.current = false;
        setMessages([]);
        loadMessages(sessionId);
      }
    });
    return unsubscribe;
  }, [loadMessages]);

  // TTS 播放辅助回复
  const speakReply = useCallback((content: string) => {
    if (!content || content === lastSpokenContent.current) return;
    lastSpokenContent.current = content;

    speakText(
      content,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false),
    );
  }, []);

  // 处理服务端消息
  const handleServerMessage = useCallback((msg: WSServerMessage) => {
    switch (msg.type) {
      case 'chunk': {
        const { content } = msg.data as { content?: string };
        if (content) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && !last.id.endsWith('-done')) {
              // 追加到上一条 AI 消息
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                content: last.content + content,
              };
              return updated;
            }
            // 创建新的 AI 消息
            return [
              ...prev,
              {
                id: uid(),
                role: 'assistant',
                content,
                timestamp: new Date().toISOString(),
                isVoice: false,
              },
            ];
          });
        }
        break;
      }
      case 'complete': {
        setIsLoading(false);
        const { content } = msg.data as { content?: string };
        if (content) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                id: last.id + '-done',
                content: content || last.content,
              };
              return updated;
            }
            return prev;
          });
          // TTS 播放
          speakReply(content);
          eventBus.emit(EVENTS.VOICE_REPLY_COMPLETE, { sessionId: currentSessionId });
        }
        break;
      }
      case 'error': {
        setIsLoading(false);
        const { error } = msg.data as { error?: string };
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: `⚠️ ${error || '发生未知错误'}`,
            timestamp: new Date().toISOString(),
            isVoice: false,
          },
        ]);
        break;
      }
      default:
        break;
    }
  }, [currentSessionId, speakReply]);

  // 发送消息到 WS
  const sendMessage = useCallback((content: string, isVoice: boolean) => {
    const sessionId = recordingSessionId.current;

    // === 客户端意图检测 ===
    const detection = detectIntent(content);
    if (detection.matched && detection.intent) {
      // 无论是否在线，先添加用户消息
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          isVoice,
        },
      ]);

      if (isLocalOnlyIntent(detection.intent.type)) {
        // 纯本地意图：不上报服务端，直接返回本地回复
        const reply = getIntentLocalReply(detection.intent.type, detection.intent.params);
        if (reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'assistant',
              content: reply,
              timestamp: new Date().toISOString(),
              isVoice: false,
            },
          ]);
        }
        // 本地意图不改变 isLoading
        eventBus.emit(EVENTS.VOICE_INTENT_ACTION, { intent: detection.intent });
        return;
      }

      if (isEventDrivenIntent(detection.intent.type)) {
        // 事件驱动意图：本地回复 + 事件发射，不上报服务端
        const reply = getIntentLocalReply(detection.intent.type, detection.intent.params);
        if (reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: 'assistant',
              content: reply,
              timestamp: new Date().toISOString(),
              isVoice: false,
            },
          ]);
        }
        // 新建会话意图直接走 voice:session:create 事件
        if (detection.intent.type === 'new_session') {
          const params = detection.intent.params as { title?: string };
          eventBus.emit(EVENTS.VOICE_SESSION_CREATE, {
            title: params.title || '新会话',
            topic: 'other',
          });
        } else {
          eventBus.emit(EVENTS.VOICE_INTENT_ACTION, { intent: detection.intent });
        }
        return;
      }

      // 意图需要服务端处理：附加 intent 到消息，继续发送
      setIsLoading(true);
      const clientMsg: WSClientMessage = {
        type: 'message',
        sessionId: sessionId!,
        content,
        isVoice,
        intent: detection.intent,
      };
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(clientMsg));
      }
      eventBus.emit(EVENTS.VOICE_MESSAGE_SEND, { content, sessionId, intent: detection.intent, isVoice });
      return;
    }

    // === 无意图/普通消息：原有逻辑 ===
    if (!sessionId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // 降级：添加本地消息（离线模式）
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
          isVoice,
        },
        {
          id: uid(),
          role: 'assistant',
          content: '⚠️ 无法连接到服务器，消息将在恢复连接后发送',
          timestamp: new Date().toISOString(),
          isVoice: false,
        },
      ]);
      return;
    }

    // 添加用户消息
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        isVoice,
      },
    ]);

    setIsLoading(true);

    const clientMsg: WSClientMessage = {
      type: 'message',
      sessionId,
      content,
      isVoice,
    };
    wsRef.current.send(JSON.stringify(clientMsg));
    eventBus.emit(EVENTS.VOICE_MESSAGE_SEND, { content, sessionId, isVoice });
  }, []);

  // 文本消息
  const sendTextMessage = useCallback((text: string) => {
    sendMessage(text, false);
  }, [sendMessage]);

  // 开始录制
  const startRecording = useCallback(() => {
    if (isSttListening) {
      stopStt();
    }
    startAudioRecorder().catch(() => {
      // 错误已经在 hook 内部处理
    });
    eventBus.emit(EVENTS.VOICE_RECORDING_START);
  }, [startAudioRecorder, isSttListening, stopStt]);

  // 停止录制并转写发送
  const stopRecording = useCallback(() => {
    stopAudioRecorder().then(async (blob) => {
      if (!blob) return;

      // 录音结束后启动 STT 转写
      try {
        const transcribedText = await startStt();
        const text = transcribedText || '[无法识别语音]';
        sendMessage(text, true);
        eventBus.emit(EVENTS.VOICE_RECORDING_END, {
          text,
          sessionId: currentSessionId,
        });
      } catch {
        // 如果 STT 失败，降级发送占位文本
        sendMessage('[语音消息]', true);
        eventBus.emit(EVENTS.VOICE_RECORDING_END, {
          text: '[语音消息]',
          sessionId: currentSessionId,
        });
      }
    });
  }, [stopAudioRecorder, startStt, sendMessage, currentSessionId]);

  // 合并录音/STT错误为单一提示
  const voiceError = recorderError || sttError || null;

  return {
    messages,
    isRecording,
    isLoading,
    isConnected,
    currentSessionId,
    interimText,
    isSpeaking,
    isMuted,
    error: voiceError,
    startRecording,
    stopRecording,
    sendTextMessage,
  };
}