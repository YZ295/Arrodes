import { useEffect, useRef, type KeyboardEvent } from 'react';

/* ============================================================
 * VoiceInputBlurText — 语音输入的模糊文本组件
 *
 * 将 interimText 以模糊半透明形式实时显示在 textarea 内，
 * 位于当前已输入文本的末尾（插入点），不干扰用户正常输入。
 * 点击穿透确保 textarea 始终可交互。
 * ============================================================ */
interface VoiceInputBlurTextProps {
  value: string;
  onChange: (value: string) => void;
  interimText: string;
  isRecording: boolean;
  disabled?: boolean;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** 附加到外层容器上的 class */
  className?: string;
}

export default function VoiceInputBlurText({
  value,
  onChange,
  interimText,
  isRecording,
  disabled = false,
  placeholder = '输入消息...',
  onKeyDown,
  className = '',
}: VoiceInputBlurTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  /* ---------- 同步滚动 ---------- */
  const handleScroll = () => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  /* ---------- 自动撑高 ---------- */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [value, interimText]);

  const showOverlay = isRecording && interimText;
  // 保证 textarea 与 overlay 的文字完全对齐
  const textStyles = 'px-3 py-2 text-sm leading-5';

  return (
    <div className={`relative ${className}`}>
      {/* 模糊 overlay — 置于 textarea 上方，点击穿透 */}
      {showOverlay && (
        <div
          ref={overlayRef}
          className={`
            absolute inset-0 z-20 pointer-events-none
            overflow-hidden rounded-xl
            ${textStyles}
          `}
          aria-hidden="true"
        >
          {/* 已有文本（正常显示） */}
          <span className="whitespace-pre-wrap break-words text-[var(--color-text-primary)]">
            {value}
          </span>
          {/* 实时语音转写（模糊） */}
          <span className="whitespace-pre-wrap break-words text-yellow-400/60 blur-[2px] select-none">
            {interimText}
          </span>
          {/* 闪烁光标指示插入点 */}
          <span className="inline-block w-[2px] h-[1.1em] bg-yellow-400/60 animate-pulse ml-px align-text-bottom" />
        </div>
      )}

      {/* 实际文本输入框 */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        className={`
          w-full bg-white/5 rounded-xl
          text-[var(--color-text-primary)] placeholder-gray-500
          resize-none outline-none
          transition-colors duration-200
          focus:bg-white/10
          disabled:opacity-40
          ${textStyles}
        `}
      />
    </div>
  );
}