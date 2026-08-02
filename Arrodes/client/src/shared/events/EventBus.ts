/**
 * 阿罗德斯事件总线
 * 模块间通信的核心机制，基于 EventEmitter 模式
 */

type EventCallback = (...args: unknown[]) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private onceListeners: Map<string, Set<EventCallback>> = new Map();

  /** 监听事件 */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // 返回取消监听函数
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /** 一次性监听 */
  once(event: string, callback: EventCallback): void {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event)!.add(callback);
  }

  /** 触发事件 */
  emit(event: string, ...args: unknown[]): void {
    // 触发普通监听
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(...args);
      } catch (e) {
        console.error(`[EventBus] Error in listener for "${event}":`, e);
      }
    });

    // 触发一次性监听并清理
    this.onceListeners.get(event)?.forEach((cb) => {
      try {
        cb(...args);
      } catch (e) {
        console.error(`[EventBus] Error in once-listener for "${event}":`, e);
      }
    });
    this.onceListeners.delete(event);
  }

  /** 移除特定事件的特定回调 */
  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
    this.onceListeners.get(event)?.delete(callback);
  }

  /** 移除事件的所有监听 */
  removeAll(event?: string): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }
}

/** 全局单例 */
export const eventBus = new EventBus();
export default EventBus;

/**
 * 事件名称常量
 *
 * ===== 宇宙系统事件 =====
 * "universe:planet:click"       - 点击星球 { sessionId: string }
 * "universe:planet:doubleclick" - 双击星球 { sessionId: string }
 * "universe:planet:spawned"     - 新星球生成 { sessionId: string, position: {x,y,z} }
 * "universe:camera:arrived"     - 相机到达目标 { sessionId: string }
 *
 * ===== 语音系统事件 =====
 * "voice:recording:start"       - 开始录音
 * "voice:recording:end"         - 结束录音 { text: string, sessionId: string }
 * "voice:message:send"          - 发送消息 { content: string, sessionId: string, isVoice: boolean }
 * "voice:reply:complete"        - AI 回复完成 { sessionId: string }
 * "voice:session:create"        - 创建新会话 { title: string, topic: string }
 * "voice:session:switch"        - 切换会话 { sessionId: string }
 * "voice:intent:action"         - 客户端意图触发 { intent: IntentResult }
 *
 * ===== 导航系统事件 =====
 * "nav:search:select"           - 搜索选中 { sessionId: string }
 * "nav:list:select"             - 列表选中 { sessionId: string }
 *
 * ===== 应用事件 =====
 * "app:ready"                   - 应用初始化完成
 */
export const EVENTS = {
  // 宇宙系统
  UNIVERSE_PLANET_CLICK: 'universe:planet:click',
  UNIVERSE_PLANET_DOUBLECLICK: 'universe:planet:doubleclick',
  UNIVERSE_PLANET_SPAWNED: 'universe:planet:spawned',
  UNIVERSE_CAMERA_ARRIVED: 'universe:camera:arrived',

  // 语音系统
  VOICE_RECORDING_START: 'voice:recording:start',
  VOICE_RECORDING_END: 'voice:recording:end',
  VOICE_MESSAGE_SEND: 'voice:message:send',
  VOICE_REPLY_COMPLETE: 'voice:reply:complete',
  VOICE_SESSION_CREATE: 'voice:session:create',
  VOICE_SESSION_SWITCH: 'voice:session:switch',
  VOICE_INTENT_ACTION: 'voice:intent:action',

  // TTS 播放（字幕跟随朗读）
  TTS_PLAY_START: 'tts:play:start',
  TTS_PLAY_END: 'tts:play:end',

  // 导航
  NAV_SEARCH_SELECT: 'nav:search:select',
  NAV_LIST_SELECT: 'nav:list:select',

  // 应用
  APP_READY: 'app:ready',
} as const;
