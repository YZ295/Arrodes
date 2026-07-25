/**
 * 语音对话面板
 * 半透明磨砂玻璃风格的聊天界面
 *
 * 包含：VoiceDialog（主面板）、ChatInput（输入区）、MessageList（消息列表）、MessageBubble（消息气泡）
 */
import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import VoiceInputBlurText from './components/VoiceInputBlurText';
import type { Message } from '@shared/types';
import { useVoiceChat } from './hooks/useVoiceChat';
import { eventBus, EVENTS } from '../shared/events/EventBus';

/* ============================================================
 * MessageBubble — 消息气泡（用户 / AI）
 * ============================================================ */
interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 animate-fade-in`}
    >
      <div
        className={`
          max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-[var(--color-bubble-user)] text-white rounded-br-md'
            : 'bg-[var(--color-bubble-ai)] text-[var(--color-text-primary)] rounded-bl-md'
          }
        `}
      >
        <p>{message.content}</p>
        <span
          className={`
            block mt-1 text-[10px] opacity-50
            ${isUser ? 'text-right' : 'text-left'}
          `}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {message.isVoice && (
            <span className="ml-1.5 inline-block">🎤</span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
 * MessageList — 消息列表（含空白提示 / 加载动画）
 * ============================================================ */
interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm opacity-40 select-none">
        <div className="text-center">
          <svg className="w-8 h-8 mx-auto mb-2 opacity-60" viewBox="0 0 24 24" fill="var(--color-home-gold)">
            <path d="M12 2.5a1 1 0 011 1v1.3a6.5 6.5 0 015.2 5.2h1.3a1 1 0 110 2h-1.3a6.5 6.5 0 01-5.2 5.2v1.3a1 1 0 11-2 0v-1.3a6.5 6.5 0 01-5.2-5.2H4.5a1 1 0 110-2h1.3a6.5 6.5 0 015.2-5.2V3.5a1 1 0 011-1z" />
          </svg>
          <p>点击麦克风开始对话</p>
          <p className="text-xs mt-1">或输入文字消息</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scroll-smooth">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {isLoading && (
        <div className="flex justify-start mb-3">
          <div className="bg-[var(--color-bubble-ai)] rounded-2xl rounded-bl-md px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

/* ============================================================
 * ChatInput — 文本输入 + 语音录制按钮 + 发送按钮
 * ============================================================ */
interface ChatInputProps {
  onSendText: (text: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  interimText: string;
  disabled?: boolean;
}

function ChatInput({
  onSendText,
  onStartRecording,
  onStopRecording,
  isRecording,
  interimText,
  disabled,
}: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendText(trimmed);
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = () => {
    if (disabled) return;
    if (isRecording) {
      // 停止录制时，将尚未确认的语音转写结果追加到输入框
      if (interimText) {
        setText((prev) => prev + interimText);
      }
      onStopRecording();
    } else {
      onStartRecording();
    }
  };

  return (
    <div className="border-t border-white/10 px-4 py-3">
      <div className="flex items-end gap-2">
        {/* 文本输入框 + 语音模糊转写 */}
        <VoiceInputBlurText
          value={text}
          onChange={setText}
          onKeyDown={handleKeyDown}
          interimText={interimText}
          isRecording={isRecording}
          disabled={disabled}
          placeholder="输入消息..."
          className="flex-1"
        />

        {/* 语音录制按钮 */}
        <button
          onClick={handleMicClick}
          disabled={disabled}
          className={`
            w-9 h-9 rounded-full flex items-center justify-center
            transition-all duration-200 shrink-0
            ${isRecording
              ? 'bg-red-500 scale-110 shadow-lg shadow-red-500/30'
              : 'bg-white/10 hover:bg-white/20'
            }
            disabled:opacity-40 disabled:cursor-not-allowed
          `}
          title={isRecording ? '停止录制' : '开始录制'}
        >
          {isRecording ? (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0M12 18v3M9 21h6" />
            </svg>
          )}
        </button>

        {/* 发送按钮 */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="w-9 h-9 rounded-full bg-[var(--color-home-gold)] flex items-center justify-center shrink-0 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
        >
          <svg className="w-4 h-4 text-[var(--color-bg-deep)]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * VoiceDialog — 主面板
 * ============================================================ */
export default function VoiceDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const {
    messages,
    isRecording,
    isLoading,
    isConnected,
    interimText,
    isSpeaking,
    startRecording,
    stopRecording,
    sendTextMessage,
    currentSessionId,
  } = useVoiceChat();

  // Cmd/Ctrl + K 切换面板显示/隐藏
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown as EventListener);
    return () => window.removeEventListener('keydown', handleKeyDown as EventListener);
  }, []);

  // 点击星球时打开面板
  useEffect(() => {
    const unsubscribe = eventBus.on(EVENTS.UNIVERSE_PLANET_CLICK, () => {
      setIsOpen(true);
    });
    return unsubscribe;
  }, []);

  const handleSendText = useCallback((text: string) => {
    sendTextMessage(text);
  }, [sendTextMessage]);

  const handleStartRecording = useCallback(() => {
    startRecording();
  }, [startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  if (!isOpen) return null;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="
        absolute bottom-6 right-6 z-50
        w-[380px] h-[520px] max-h-[80vh]
        rounded-2xl
        bg-[var(--color-bg-glass)]
        backdrop-blur-xl
        border border-white/10
        shadow-2xl
        flex flex-col
        overflow-hidden
        select-none
      "
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
          />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            阿罗德斯
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          {isSpeaking && (
            <span className="flex items-center gap-1 text-yellow-400">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-8.464a5 5 0 000 7.072" />
              </svg>
              播放中
            </span>
          )}
          {currentSessionId ? (
            <span className="truncate max-w-[120px]">
              ID: {currentSessionId.slice(0, 8)}
            </span>
          ) : (
            <span>新会话</span>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* 输入区域 */}
      <ChatInput
        onSendText={handleSendText}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        isRecording={isRecording}
        interimText={interimText}
        disabled={!isConnected}
      />
    </div>
  );
}
