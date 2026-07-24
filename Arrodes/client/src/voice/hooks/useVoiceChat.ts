/**
 * 语音聊天 Hook
 * 管理 WebSocket 连接、消息状态、录制和发送
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import type { Message, WSClientMessage, WSServerMessage } from '@shared/types';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import { useAudioRecorder } from './useAudioRecorder';

interface UseVoiceChatReturn {
  messages: Message[];
  isRecording: boolean;
  isLoading: boolean;
  isConnected: boolean;
  currentSessionId: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  sendTextMessage: (text: string) => void;
}

// 简易 ID 生成
function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useVoiceChat(): UseVoiceChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recordingSessionId = useRef<string | null>(null);

  const {
    isRecording,
    startRecording: startAudioRecorder,
    stopRecording: stopAudioRecorder,
    error: recorderError,
  } = useAudioRecorder();

  // 录音错误监控
  useEffect(() => {
    if (recorderError) {
      console.warn('[VoiceChat] 录音器异常:', recorderError);
    }
  }, [recorderError]);

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

      ws.onmessage = (event) => {
        try {
          const serverMsg: WSServerMessage = JSON.parse(event.data);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [currentSessionId]);

  // 发送消息到 WS
  const sendMessage = useCallback((content: string, isVoice: boolean) => {
    const sessionId = recordingSessionId.current;
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
    startAudioRecorder().catch(() => {
      // 错误已经在 hook 内部处理
    });
    eventBus.emit(EVENTS.VOICE_RECORDING_START);
  }, [startAudioRecorder]);

  // 停止录制并发送
  const stopRecording = useCallback(() => {
    stopAudioRecorder().then((blob) => {
      if (blob) {
        // 语音转文字（模拟阶段：占位文本）
        const mockTranscribedText = '[语音消息]';
        sendMessage(mockTranscribedText, true);
        eventBus.emit(EVENTS.VOICE_RECORDING_END, {
          text: mockTranscribedText,
          sessionId: currentSessionId,
        });
      }
    });
  }, [stopAudioRecorder, sendMessage, currentSessionId]);

  return {
    messages,
    isRecording,
    isLoading,
    isConnected,
    currentSessionId,
    startRecording,
    stopRecording,
    sendTextMessage,
  };
}
