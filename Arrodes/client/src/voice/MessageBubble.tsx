/**
 * 消息气泡组件
 * 区分用户消息和 AI 消息的视觉样式
 */
import type { Message } from '@shared/types';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
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
