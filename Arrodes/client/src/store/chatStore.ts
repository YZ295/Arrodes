/**
 * 聊天状态管理（Zustand）
 *
 * 统一管理 Session 列表、当前会话消息、记忆节点，
 * 提供 sendMessage / switchSession / createSession / deleteSession / loadSessions 等动作。
 *
 * 设计原则：
 * - 只关心数据状态，不管理 WebSocket 连接（由 useVoiceChat 等 hook 驱动）
 * - REST API 操作用 fetch 完成，错误以 sessionsError / messagesError 暴露
 * - 流式场景：hook 层调用 addUserMessage → 自行发送 WS → 然后调用 appendToLastAiMessage / completeLastAiMessage
 * - 非流式场景：sendMessage 同时完成乐观添加 + fetch POST + 响应更新
 */
import { create } from 'zustand';
import type {
  SessionNode,
  Message,
  MemoryNode,
  CreateSessionRequest,
} from '@shared/types';

// ---- 工具 ----

function uid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- 类型 ----

export interface ChatState {
  /* ---------- Session 列表 ---------- */
  sessions: SessionNode[];
  sessionsLoading: boolean;
  sessionsError: string | null;

  /* ---------- 当前会话 ---------- */
  currentSessionId: string | null;
  messages: Message[];
  messagesLoading: boolean;
  messagesError: string | null;

  /* ---------- 当前会话记忆 ---------- */
  memories: MemoryNode[];

  /* ---------- 实时状态 ---------- */
  isAiResponding: boolean;
  isConnected: boolean;

  /* ========== 动作 ========== */

  // ---- Session CRUD ----

  /** 从服务端加载所有 session */
  loadSessions: () => Promise<void>;

  /** 创建新 session，返回新 session id */
  createSession: (data: CreateSessionRequest) => Promise<string>;

  /** 删除指定 session */
  deleteSession: (id: string) => Promise<void>;

  /** 切换当前 session（自动加载消息） */
  switchSession: (id: string) => Promise<void>;

  // ---- 消息发送（非流式） ----

  /**
   * 发送消息（乐观添加 + fetch POST + 更新响应）
   * 适用于非流式场景；流式场景请使用 addUserMessage + appendToLastAiMessage + completeLastAiMessage 组合
   */
  sendMessage: (content: string, isVoice?: boolean) => Promise<void>;

  // ---- 流式消息构建（供 WebSocket hook 调用） ----

  /** 乐观添加一条用户消息，返回消息 id */
  addUserMessage: (content: string, isVoice?: boolean) => string;

  /** 追加内容到最后一条 AI 消息（流式 chunk） */
  appendToLastAiMessage: (chunk: string) => void;

  /** 完成最后一条 AI 消息，并记录关联记忆 */
  completeLastAiMessage: (finalContent: string, memories?: MemoryNode[]) => void;

  // ---- 状态设置 ----

  setAiResponding: (v: boolean) => void;
  setConnected: (v: boolean) => void;
  clearCurrentSession: () => void;
}

// ---- 初始值 ----

const INITIAL_STATE = {
  sessions: [],
  sessionsLoading: false,
  sessionsError: null,
  currentSessionId: null,
  messages: [],
  messagesLoading: false,
  messagesError: null,
  memories: [],
  isAiResponding: false,
  isConnected: false,
};

// ---- Store ----

export const useChatStore = create<ChatState>((set, get) => ({
  ...INITIAL_STATE,

  /* ==================== Session CRUD ==================== */

  loadSessions: async () => {
    set({ sessionsLoading: true, sessionsError: null });
    try {
      const res = await fetch('/api/v1/sessions');
      if (!res.ok) throw new Error(`loadSessions failed: ${res.status}`);
      const data = await res.json();
      set({ sessions: data.sessions ?? data, sessionsLoading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'loadSessions failed';
      set({ sessionsError: msg, sessionsLoading: false });
    }
  },

  createSession: async (data) => {
    const res = await fetch('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
    const session: SessionNode = await res.json();

    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSessionId: session.id,
      messages: [],
      memories: [],
    }));

    return session.id;
  },

  deleteSession: async (id) => {
    const res = await fetch(`/api/v1/sessions/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      throw new Error(`deleteSession failed: ${res.status}`);
    }

    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      const isCurrent = state.currentSessionId === id;
      return {
        sessions,
        currentSessionId: isCurrent ? null : state.currentSessionId,
        messages: isCurrent ? [] : state.messages,
        memories: isCurrent ? [] : state.memories,
      };
    });
  },

  switchSession: async (id) => {
    if (id === get().currentSessionId) return;

    set({ currentSessionId: id, messages: [], memories: [], messagesLoading: true, messagesError: null });

    try {
      const res = await fetch(`/api/v1/sessions/${id}`);
      if (!res.ok) throw new Error(`switchSession failed: ${res.status}`);
      const data = await res.json();

      set({
        messages: data.messages ?? [],
        memories: data.keyMemories ?? [],
        messagesLoading: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'switchSession failed';
      set({ messagesError: msg, messagesLoading: false });
    }
  },

  /* ==================== Message sending ==================== */

  sendMessage: async (content, isVoice = false) => {
    const sessionId = get().currentSessionId;
    if (!sessionId) return;

    // 乐观添加用户消息
    const userMsgId = uid();
    const userMessage: Message = {
      id: userMsgId,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      isVoice,
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isAiResponding: true,
    }));

    try {
      const res = await fetch(`/api/v1/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, isVoice }),
      });

      if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);

      const data = await res.json();

      // 添加 AI 回复
      const aiMsgId = uid();
      const aiMessage: Message = {
        id: aiMsgId,
        role: 'assistant',
        content: data.reply ?? '',
        timestamp: new Date().toISOString(),
        isVoice: false,
      };

      set((state) => ({
        messages: [...state.messages, aiMessage],
        memories: data.memories ?? state.memories,
        isAiResponding: false,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'sendMessage failed';
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: uid(),
            role: 'assistant',
            content: `[发送失败] ${msg}`,
            timestamp: new Date().toISOString(),
            isVoice: false,
          },
        ],
        isAiResponding: false,
        messagesError: msg,
      }));
    }
  },

  /* ==================== Streaming message mutations ==================== */

  addUserMessage: (content, isVoice = false) => {
    const id = uid();
    const message: Message = {
      id,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      isVoice,
    };
    set((state) => ({ messages: [...state.messages, message] }));
    return id;
  },

  appendToLastAiMessage: (chunk) => {
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];

      if (last && last.role === 'assistant' && !last.id.endsWith('-done')) {
        // 追加到已有 AI 消息
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
      } else {
        // 新建 AI 消息
        msgs.push({
          id: uid(),
          role: 'assistant',
          content: chunk,
          timestamp: new Date().toISOString(),
          isVoice: false,
        });
      }

      return { messages: msgs };
    });
  },

  completeLastAiMessage: (finalContent, memories) => {
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];

      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          id: last.id + '-done',
          content: finalContent || last.content,
        };
      }

      return {
        messages: msgs,
        memories: memories ?? state.memories,
        isAiResponding: false,
      };
    });
  },

  /* ==================== State setters ==================== */

  setAiResponding: (v) => set({ isAiResponding: v }),

  setConnected: (v) => set({ isConnected: v }),

  clearCurrentSession: () =>
    set({
      currentSessionId: null,
      messages: [],
      memories: [],
      messagesError: null,
    }),
}));