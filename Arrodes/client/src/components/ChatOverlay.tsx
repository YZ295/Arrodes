/**
 * 字幕对话覆盖层
 *
 * 替代旧的浮动对话框。AI 回复显示为星球上方的字幕，
 * 用户输入显示为星球下方的文字。底部是极简输入栏。
 *
 * 布局：
 * ┌─────────────────────────────┐
 * │                             │
 * │      AI 字幕 (大字)          │  ← 最新 AI 回复
 * │   "愚者大人，晚上好..."       │
 * │                             │
 * │      🌍 主星球               │
 * │                             │
 * │    用户输入 (小字)           │  ← 最新用户消息
 * │                             │
 * ├─────────────────────────────┤
 * │ [🎤] [输入框........] [→]   │  ← 底部输入栏
 * └─────────────────────────────┘
 */
import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import AudioVisualizer from './AudioVisualizer';
import MirrorShardText from './MirrorShardText';
import type { Message } from '@shared/types';

interface ChatOverlayProps {
  messages: Message[];
  isRecording: boolean;
  recordingDuration: number;
  recordingVolume: number;
  isLoading: boolean;
  isConnected: boolean;
  interimText: string;
  isSpeaking: boolean;
  ttsError: string | null;
  error: string | null;
  showMemoryToast: boolean;
  memoryToastText: string;
  startRecording: () => void;
  stopRecording: () => void;
  sendTextMessage: (text: string) => void;
  replayTTS: () => void;
}

export default function ChatOverlay(props: ChatOverlayProps) {
  const {
    messages, isRecording, recordingDuration, recordingVolume,
    isLoading, isConnected, interimText, isSpeaking,
    ttsError, error, showMemoryToast, memoryToastText,
    startRecording, stopRecording, sendTextMessage, replayTTS,
  } = props;

  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 获取最新的 AI 消息和用户消息
  const lastAiMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');

  // 自动滚动
  useEffect(() => {
    if (lastAiMsg) {
      // 字幕出现时可以加一些动画效果
    }
  }, [lastAiMsg?.id]);

  const handleSend = () => {
    const t = text.trim();
    if (t && isConnected) {
      sendTextMessage(t);
      setText('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 截断显示
  const aiSubtitle = lastAiMsg?.content || '';
  const displayAiText = aiSubtitle.length > 200 ? aiSubtitle.slice(0, 200) + '…' : aiSubtitle;

  return (
    <div className="absolute inset-0 z-30 flex flex-col pointer-events-none">
      {/* 顶部：AI 字幕（星球上方居中） */}
      <div className="flex-1 flex items-center justify-center px-8 pb-[5vh]">
        {displayAiText ? (
          <div className="max-w-2xl w-full text-center animate-fade-in pointer-events-auto">
            <MirrorShardText
              text={displayAiText}
              charDelay={35}
              color="#e0f7fa"
              className="text-lg md:text-xl lg:text-2xl"
            />
            {isSpeaking && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <AudioVisualizer mode="wave" level={128} isActive color="#00ffc8" width={180} height={14} />
              </div>
            )}
            {ttsError && (
              <button onClick={replayTTS} className="mt-3 text-xs text-red-400/60 hover:text-red-300 pointer-events-auto">
                {ttsError} · ▶ 重播
              </button>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-2.5 h-2.5 bg-cyan-400/60 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        ) : !isRecording ? (
          <div className="text-center text-white/15">
            <p className="text-sm tracking-wider">按住麦克风开始</p>
          </div>
        ) : null}
      </div>

      {/* 中部：用户输入预览（星球下方） */}
      <div className="flex items-start justify-center px-8 pb-2 min-h-[40px]">
        {interimText && isRecording ? (
          <p className="text-sm text-cyan-300/60 animate-pulse text-center max-w-md font-mono tracking-wide">
            {interimText}
          </p>
        ) : lastUserMsg ? (
          <p className="text-xs text-white/25 text-center max-w-md truncate font-mono">
            ▸ {lastUserMsg.content}
          </p>
        ) : null}
      </div>

      {/* 记忆提示 */}
      {showMemoryToast && (
        <div className="px-8 pb-1 text-center">
          <span className="text-xs text-green-400/60 animate-fade-in">{memoryToastText}</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="px-8 pb-1 text-center">
          <span className="text-xs text-red-400/60">{error}</span>
        </div>
      )}

      {/* 录音指示器 */}
      {isRecording && (
        <div className="px-8 pb-1 flex items-center justify-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <AudioVisualizer mode="bars" level={recordingVolume} isActive color="#ef4444" width={160} height={16} />
          <span className="text-xs text-red-300/80">{recordingDuration}s</span>
        </div>
      )}

      {/* 底部输入栏 */}
      <div className="px-8 pb-6 pt-2 pointer-events-auto">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          {/* 麦克风按钮 */}
          <button
            onMouseDown={(e) => { e.preventDefault(); if (isConnected) startRecording(); }}
            onMouseUp={() => stopRecording()}
            onMouseLeave={() => { if (isRecording) stopRecording(); }}
            disabled={!isConnected}
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
              isRecording
                ? 'bg-red-500 scale-110 shadow-lg shadow-red-500/40'
                : 'bg-white/5 hover:bg-white/10 border border-white/10'
            } disabled:opacity-30`}
            title={isRecording ? '松开发送' : '按住说话'}
          >
            {isRecording ? (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0M12 18v3M9 21h6" />
              </svg>
            )}
          </button>

          {/* 文字输入 */}
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? '输入消息…' : '正在连接…'}
            disabled={!isConnected}
            rows={1}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90
              placeholder-white/20 outline-none resize-none focus:border-cyan-400/30 focus:bg-white/8
              transition-all max-h-32 disabled:opacity-30"
            style={{ minHeight: '44px' }}
          />

          {/* 发送按钮 */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || !isConnected}
            className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/80 to-cyan-700/80
              flex items-center justify-center shrink-0 disabled:opacity-20 hover:from-cyan-400/80 hover:to-cyan-600/80
              transition-all"
          >
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
