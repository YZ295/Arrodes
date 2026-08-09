/**
 * useSessionManager：会话管理 Hook（T10 拆分自 useVoiceChat）
 *
 * 职责：消息列表、当前会话、会话切换/创建/初始化、会话相关事件订阅。
 * 对外暴露消息状态与会话操作，供 useVoiceChat 组合。
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import type { Message, SessionNode } from '@shared/types';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import { uid } from '../../shared/utils/uid';
import { api } from '../../shared/utils/apiClient';
import { useWorkspaceStore } from '../../store/workspaceStore';

export interface SessionManagerApi {
  messages: Message[];
  currentSessionId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loadMessages: (sessionId: string) => Promise<void>;
  initSession: () => Promise<void>;
  switchSession: (sessionId: string) => void;
  createNewSession: (title?: string) => Promise<string | null>;
}

export function useSessionManager(): SessionManagerApi {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const recordingSessionIdRef = useRef<string | null>(null);
  const hasInitialized = useRef(false);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const data = await api.get<{ messages?: Message[] }>(`/messages/${sessionId}`);
      if (data.messages) setMessages(data.messages);
    } catch {
      /* 静默降级 */
    }
  }, []);

  // 会话初始化：加载/创建第一个有效会话
  const initSession = useCallback(async () => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    try {
      const ws = useWorkspaceStore.getState().activeWorkspaceId;
      const data = await api.get<{ sessions: SessionNode[] }>(`/sessions?ws=${encodeURIComponent(ws)}`);
      const sessions = data.sessions || [];
      const valid = sessions.filter((s) => s.messageCount > 0);

      if (valid.length > 0) {
        const first = valid[0];
        setCurrentSessionId(first.id);
        recordingSessionIdRef.current = first.id;
        loadMessages(first.id);
      } else {
        const session = await api.post<SessionNode>('/sessions', { title: '新对话', topic: 'other', workspaceId: ws });
        setCurrentSessionId(session.id);
        recordingSessionIdRef.current = session.id;
      }
    } catch {
      const tmpId = uid();
      setCurrentSessionId(tmpId);
      recordingSessionIdRef.current = tmpId;
    }
  }, [loadMessages]);

  // 切换会话
  const switchSession = useCallback((sessionId: string) => {
    if (sessionId === currentSessionId) return;
    setCurrentSessionId(sessionId);
    recordingSessionIdRef.current = sessionId;
    setMessages([]);
    loadMessages(sessionId);
  }, [currentSessionId, loadMessages]);

  // 创建新会话
  const createNewSession = useCallback(async (title = '新会话'): Promise<string | null> => {
    try {
      const ws = useWorkspaceStore.getState().activeWorkspaceId;
      const session = await api.post<SessionNode>('/sessions', { title, topic: 'other', workspaceId: ws });
      switchSession(session.id);
      return session.id;
    } catch (err) {
      console.error('[SessionManager] 创建会话失败:', err);
      return null;
    }
  }, [switchSession]);

  // 事件驱动：会话切换 / 新建
  useEffect(() => {
    const u1 = eventBus.on(EVENTS.VOICE_SESSION_SWITCH, (data: unknown) => {
      const { sessionId } = (data as { sessionId: string }) || {};
      if (sessionId) switchSession(sessionId);
    });
    const u2 = eventBus.on(EVENTS.VOICE_SESSION_CREATE, (data: unknown) => {
      const { title } = (data as { title?: string }) || {};
      createNewSession(title);
    });
    return () => { u1(); u2(); };
  }, [switchSession, createNewSession]);

  return {
    messages,
    currentSessionId,
    setMessages,
    loadMessages,
    initSession,
    switchSession,
    createNewSession,
  };
}
