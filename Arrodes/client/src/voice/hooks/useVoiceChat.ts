/**
 * 语音聊天 Hook
 * 管理 WebSocket 连接、消息状态、录制、STT/TTS 和消息加载
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import type { Message, WSClientMessage, WSServerMessage } from '@shared/types';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
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
    const wsUrl = `${protocol}//${window.location.host}/v1/chat`;
    let ws: WebSocket;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        hasLoadedHistory.current = false;

        // 新会话 — 先创建会话
        fetch('/api/v1/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '新对话', topic: 'other' }),
        })
          .then((r) => r.json())
          .then((data) => {
            setCurrentSessionId(data.id);
            recordingSessionId.current = data.id;
            // 加载历史消息
            loadMessages(data.id);
          })
          .catch(() => {
            // 降级：使用临时 ID
            const tmpId = uid();
            setCurrentSessionId(tmpId);
            recordingSessionId.current = tmpId;
          });
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // 断线重连
        setTimeout(connect, 3000);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const serverMsg: WSServerMessage = JSON.parse(event.data as string);
          handleServerMessage(serverMsg);
        } catch {
          // 忽略解析失败的消息
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      ws?.close();
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        eventBus.emit(EVENTS.VOICE_INTENT_ACTION, { intent: detection.intent });
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

  return {
    messages,
    isRecording,
    isLoading,
    isConnected,
    currentSessionId,
    interimText,
    isSpeaking,
    isMuted,
    startRecording,
    stopRecording,
    sendTextMessage,
  };
}