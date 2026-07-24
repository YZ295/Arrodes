/**
 * 语音对话面板
 * 半透明磨砂玻璃风格的聊天界面
 *
 * 包含：VoiceDialog（主面板）、ChatInput（输入区）、MessageList（消息列表）、MessageBubble（消息气泡）
 */
import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import type { Message } from '@shared/types';
import { useVoiceChat } from './hooks/useVoiceChat';

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
          <div className="text-3xl mb-2">✦</div>
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
  disabled?: boolean;
}

function ChatInput({
  onSendText,
  onStartRecording,
  onStopRecording,
  isRecording,
  disabled,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整 textarea 高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [text]);

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
      onStopRecording();
    } else {
      onStartRecording();
    }
  };

  return (
    <div className="border-t border-white/10 px-4 py-3">
      <div className="flex items-end gap-2">
        {/* 文本输入框 */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          rows={1}
          disabled={disabled || isRecording}
          className={`
            flex-1 bg-white/5 rounded-xl px-3 py-2 text-sm
            text-[var(--color-text-primary)] placeholder-gray-500
            resize-none outline-none
            transition-colors duration-200
            focus:bg-white/10
            disabled:opacity-40
          `}
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
  const {
    messages,
    isRecording,
    isLoading,
    isConnected,
    startRecording,
    stopRecording,
    sendTextMessage,
    currentSessionId,
  } = useVoiceChat();

  const handleSendText = useCallback((text: string) => {
    sendTextMessage(text);
  }, [sendTextMessage]);

  const handleStartRecording = useCallback(() => {
    startRecording();
  }, [startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return (
    <div
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
        disabled={!isConnected}
      />
    </div>
  );
}
