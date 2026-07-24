/**
 * 聊天输入组件
 * 支持文本输入 + 语音录制按钮
 */
import { useState, useRef, useEffect, type KeyboardEvent } from 'react';

interface ChatInputProps {
  onSendText: (text: string) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isRecording: boolean;
  disabled?: boolean;
}

export default function ChatInput({
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
