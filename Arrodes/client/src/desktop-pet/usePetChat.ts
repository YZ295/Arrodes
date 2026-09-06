/**
 * 桌宠对话（步骤 2）
 *
 * 复用现有基础设施：
 * - MessageChannel 单例（Vite 代理注入本地访问凭据，与主窗口同协议）
 * - useTTS（服务端 TTS 播报回复）
 * - useVoiceRecorder（按住说话：录音 → /api/v1/stt/transcribe 转写）
 *
 * 桌宠拥有独立会话，不污染主窗口的对话历史。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageChannel } from '../core/MessageChannel';
import { uid } from '../shared/utils/uid';
import { useTTS } from '../voice/hooks/useTTS';
import { useVoiceRecorder } from '../voice/hooks/useVoiceRecorder';

export interface PetChatMessage {
  id: string;
  role: 'user' | 'pet';
  content: string;
}

export interface PetChatController {
  messages: PetChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  thinking: boolean;
  error: string | null;
  sendDraft: () => Promise<void>;
  /** 按住说话 */
  recording: boolean;
  startVoice: () => void;
  stopVoice: () => Promise<void>;
}

const CHAT_SESSION_TITLE = '桌宠对话';
const MAX_CHAT_HISTORY = 6;

async function ensurePetSession(): Promise<string> {
  const key = 'arrodes_desktop_pet_session';
  const stored = localStorage.getItem(key);
  if (stored) {
    const check = await fetch(`/api/v1/sessions/${stored}`);
    if (check.ok) return stored;
    localStorage.removeItem(key);
  }
  const res = await fetch('/api/v1/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: CHAT_SESSION_TITLE, topic: 'other' }),
  });
  if (!res.ok) throw new Error(`创建会话失败（${res.status}）`);
  const session = await res.json() as { id?: string };
  if (!session.id) throw new Error('创建会话失败：服务端未返回会话 id');
  localStorage.setItem(key, session.id);
  return session.id;
}

export function usePetChat(enabled: boolean): PetChatController {
  const [messages, setMessages] = useState<PetChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const tts = useTTS();

  useEffect(() => {
    if (!enabled) return;
    const channel = MessageChannel.getInstance();
    channel.connect();
    return () => { /* 由使用方统一管理生命周期，保持单例连接 */ };
  }, [enabled]);

  const sendText = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || thinking) return;
    setError(null);
    setThinking(true);
    setDraft('');
    const userMessage: PetChatMessage = { id: uid(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev.slice(-MAX_CHAT_HISTORY), userMessage]);

    try {
      const sessionId = sessionRef.current ?? await ensurePetSession();
      sessionRef.current = sessionId;

      const channel = MessageChannel.getInstance();
      if (!channel.isConnected()) throw new Error('对话连接尚未就绪，请稍后重试');
      const requestId = channel.nextRequestId();
      const replyPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error('回复超时'));
        }, 60_000);
        const unsubscribe = channel.subscribe(requestId, {
          onChunk: (data) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === 'pet' && last.id === requestId) {
                return [...prev.slice(0, -1), { ...last, content: last.content + data.content }];
              }
              return [...prev, { id: requestId, role: 'pet', content: data.content }];
            });
          },
          onComplete: (data) => {
            clearTimeout(timeout);
            unsubscribe();
            setMessages((prev) => [...prev.filter((message) => message.id !== requestId), { id: requestId, role: 'pet', content: data.content }]);
            resolve(data.content);
          },
          onError: () => {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error('对话服务返回错误'));
          },
          onStopped: () => {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error('回复已停止'));
          },
        });
        channel.send({ type: 'message', sessionId, content: trimmed, isVoice: false, requestId });
      });

      const reply = await replyPromise;
      if (reply.trim()) void tts.speak(reply).catch(() => { /* 播报失败不打断对话 */ });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '对话失败');
    } finally {
      setThinking(false);
    }
  }, [thinking, tts]);

  const sendDraft = useCallback(async () => {
    await sendText(draft);
  }, [draft, sendText]);

  const recorder = useVoiceRecorder({
    sendMessage: (content) => { void sendText(content); },
    getSessionId: () => sessionRef.current,
  });

  const startVoice = useCallback(() => {
    setError(null);
    recorder.startRecording();
  }, [recorder]);

  const stopVoice = useCallback(async () => {
    recorder.stopRecording();
  }, [recorder]);

  return {
    messages,
    draft,
    setDraft,
    thinking,
    error,
    sendDraft,
    recording: recorder.isRecording,
    startVoice,
    stopVoice,
  };
}
