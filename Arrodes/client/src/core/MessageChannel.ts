/**
 * 统一通信通道 (MessageChannel)
 *
 * 为模块间、模块与服务端之间的通信提供统一抽象。
 * 职责：
 * - 统一 WS 消息发送/接收
 * - 统一 REST API 调用
 * - 连接状态管理
 * - 自动重连
 * - 消息序列化/反序列化
 * - 请求-响应模式支持 (RPC)
 *
 * 使用方式：
 * ```ts
 * const channel = MessageChannel.getInstance();
 * channel.send({ type: 'message', sessionId, content });
 * channel.onMessage((msg) => { ... });
 * ```
 */
import { useState, useEffect, useCallback } from 'react';
import { eventBus } from '../shared/events/EventBus';
import type {
  WSClientMessage,
  WSServerMessage,
  WSCompleteData,
  WSChunkData,
  WSMemoryData,
} from '@shared/types';

// ===== 类型 =====

export type ChannelState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ChannelCallbacks {
  onStateChange?: (state: ChannelState) => void;
  onChunk?: (data: WSChunkData) => void;
  onComplete?: (data: WSCompleteData) => void;
  onMemory?: (data: WSMemoryData) => void;
  onError?: (error: string) => void;
  onRawMessage?: (msg: WSServerMessage) => void;
}

// ===== 配置 =====

const DEFAULT_CONFIG = {
  reconnectBaseDelay: 3000,
  reconnectMaxDelay: 30000,
  reconnectMaxAttempts: 10,
  wsPath: '/v1/chat',
};

// ===== MessageChannel =====

export class MessageChannel {
  private static instance: MessageChannel;

  private ws: WebSocket | null = null;
  private state: ChannelState = 'disconnected';
  private callbacks: ChannelCallbacks = {};
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private config = { ...DEFAULT_CONFIG };
  private pendingRequests: Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void; timeout: ReturnType<typeof setTimeout> }
  > = new Map();
  private requestIdCounter = 0;

  /** 获取单例 */
  static getInstance(): MessageChannel {
    if (!MessageChannel.instance) {
      MessageChannel.instance = new MessageChannel();
    }
    return MessageChannel.instance;
  }

  /** 私有构造 - 使用 getInstance() */
  private constructor() {}

  // ===== 公共方法 =====

  /**
   * 连接到 WebSocket 服务端
   */
  connect(callbacks?: ChannelCallbacks): void {
    if (callbacks) this.callbacks = callbacks;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.closed = false;
    this.state = 'connecting';
    this.callbacks.onStateChange?.('connecting');
    this.doConnect();
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.closed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
    this.callbacks.onStateChange?.('disconnected');
  }

  /**
   * 发送消息到服务端
   */
  send(msg: WSClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[MessageChannel] 无法发送消息：未连接');
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * 发送请求并等待响应 (RPC 模式)
   */
  sendAndWait<T = unknown>(msg: WSClientMessage, timeout = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${++this.requestIdCounter}_${Date.now()}`;
      const msgWithId = { ...msg, requestId };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('请求超时'));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timeout: timer,
      });

      this.send(msgWithId);
    });
  }

  /**
   * 注册消息回调
   */
  setCallbacks(callbacks: ChannelCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 获取当前连接状态
   */
  getState(): ChannelState {
    return this.state;
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  // ===== 内部方法 =====

  private doConnect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_HOST || 'localhost:3001';
    const wsUrl = `${protocol}//${wsHost}${this.config.wsPath}`;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      if (this.closed) return;
      this.state = 'connected';
      this.reconnectAttempt = 0;
      this.callbacks.onStateChange?.('connected');
      eventBus.emit('channel:connected');
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.closed) return;
      try {
        const serverMsg: WSServerMessage = JSON.parse(event.data as string);
        this.handleMessage(serverMsg);
        this.callbacks.onRawMessage?.(serverMsg);
      } catch {
        // 忽略解析失败消息
      }
    };

    ws.onclose = () => {
      if (this.closed) return;
      this.state = 'disconnected';
      this.ws = null;
      this.callbacks.onStateChange?.('disconnected');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private handleMessage(msg: WSServerMessage): void {
    switch (msg.type) {
      case 'chunk':
        this.callbacks.onChunk?.(msg.data as unknown as WSChunkData);
        break;
      case 'complete': {
        const data = msg.data as unknown as WSCompleteData;
        // 检查是否有匹配的 pending request
        const requestId = (msg.data as Record<string, unknown>).requestId as string | undefined;
        if (requestId && this.pendingRequests.has(requestId)) {
          const pending = this.pendingRequests.get(requestId)!;
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);
          pending.resolve(data);
        }
        this.callbacks.onComplete?.(data);
        break;
      }
      case 'memory':
        this.callbacks.onMemory?.(msg.data as unknown as WSMemoryData);
        break;
      case 'error': {
        const error = (msg.data as { error?: string }).error || '未知错误';
        this.callbacks.onError?.(error);
        break;
      }
      default:
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.reconnectAttempt >= this.config.reconnectMaxAttempts) {
      console.warn('[MessageChannel] 重连已达最大次数');
      this.state = 'disconnected';
      this.callbacks.onStateChange?.('disconnected');
      return;
    }

    this.state = 'reconnecting';
    this.callbacks.onStateChange?.('reconnecting');

    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempt),
      this.config.reconnectMaxDelay,
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      if (!this.closed) this.doConnect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ===== React Hook 封装 =====

export function useMessageChannel() {
  const channel = MessageChannel.getInstance();
  const [state, setState] = useState<ChannelState>(channel.getState());

  useEffect(() => {
    channel.setCallbacks({
      onStateChange: (newState) => setState(newState),
    });

    if (state === 'disconnected') {
      channel.connect();
    }

    return () => {
      // 不做断开操作，由使用方管理生命周期
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(
    (msg: WSClientMessage) => {
      channel.send(msg);
    },
    [channel],
  );

  return {
    state,
    isConnected: state === 'connected',
    send,
    channel,
  };
}
