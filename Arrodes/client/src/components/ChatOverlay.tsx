/**
 * 字幕对话覆盖层
 *
 * AI 回复显示为星球上方的字幕，用户输入显示为星球下方的文字。
 * 顶部为完整对话消息列表（可滚动），长回复不会被截断——可在对话中查看阿罗德斯全部回复。
 *
 * 布局：
 * ┌─────────────────────────────┐
 * │ [状态栏: ●已连接  播报中  隐藏]│ ← 含对话界面显隐切换
 * │ 消息列表 (可滚动, 完整内容)   │  ← 用户/AI 气泡
 * ├─────────────────────────────┤
 * │ [🎤] [输入框.....光束边框] [■][→] │  ← 底部输入栏
 * └─────────────────────────────┘
 */
import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import AudioVisualizer from './AudioVisualizer';
import MirrorShardText from './MirrorShardText';
import StatusBar from './StatusBar';
import BorderBeam from './BorderBeam';
import AgentStatusOrb from './AgentStatusOrb';
import NeonInputBar from './NeonInputBar';
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
  stopTTS: () => void;
  /** 静音开关 */
  isMuted: boolean;
  toggleMuted: () => void;
  /** 完整停止：停语音 + 停 AI 思考 + 停任务 */
  stopAll: () => void;
  projectDir?: string;
  permission?: 'default' | 'full';
  onPickProject: () => void;
  onTogglePermission: () => void;
}

export default function ChatOverlay(props: ChatOverlayProps) {
  const {
    messages, isRecording, recordingDuration, recordingVolume,
    isLoading, isConnected, interimText, isSpeaking,
    ttsError, error, showMemoryToast, memoryToastText,
    startRecording, stopRecording, sendTextMessage, replayTTS, stopAll,
    isMuted, toggleMuted,
    projectDir, permission, onPickProject, onTogglePermission,
  } = props;

  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  // 对话界面隐藏状态（persist：用户偏好）
  const [uiHidden, setUiHidden] = useState<boolean>(() => {
    try { return localStorage.getItem('arrodes.uiHidden') === '1'; } catch { return false; }
  });
  const toggleUiHidden = () => {
    setUiHidden((p) => {
      const next = !p;
      try { localStorage.setItem('arrodes.uiHidden', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  // 最新的 AI 消息和用户消息
  const lastAiMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');

  // 自动滚动到底部（新消息或内容增长时）
  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, messages[messages.length - 1]?.content?.length, isLoading]);

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

  return (
    <div className="absolute inset-0 z-30 flex flex-col pointer-events-none">
      {/* 顶部状态栏（连接 / 播报 / 引擎 / 界面显隐） */}
      <StatusBar
        isConnected={isConnected}
        isSpeaking={isSpeaking}
        ttsError={ttsError}
        uiHidden={uiHidden}
        onToggleUi={toggleUiHidden}
        isMuted={isMuted}
        onToggleMuted={toggleMuted}
      />

      {/* 顶部：完整对话消息列表（可滚动，水平居中） */}
      <div
        ref={listRef}
        className={`flex-1 overflow-y-auto px-6 pt-4 pb-2 flex justify-center
          [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]
          transition-all duration-500 ease-in-out ${
          uiHidden ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="w-full max-w-2xl flex flex-col justify-end gap-2 min-h-full">
          {messages.length === 0 && !isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-white/20 tracking-wider">向阿罗德斯问点什么吧</p>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === 'user';
              const isLastAi = m.id === lastAiMsg?.id;
              // 最新 AI 消息：边框光束（border-beam 效果，视觉强调 AI 活跃）
              const bubble = (
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
                    isUser
                      ? 'bg-cyan-500/20 border border-cyan-400/20 text-cyan-100/90'
                      : 'bg-white/5 border border-white/10 text-white/85'
                  }`}
                >
                  {!isUser && isLastAi ? (
                    <MirrorShardText
                      text={m.content}
                      charDelay={12}
                      color="#e0f7fa"
                      className="text-[15px] md:text-[17px]"
                    />
                  ) : (
                    m.content
                  )}
                </div>
              );
              return (
                <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  {!isUser && isLastAi ? (
                    <BorderBeam duration={6} colorVariant="ocean" radius={16} active={!uiHidden} borderWidth={1} fitContent>
                      {bubble}
                    </BorderBeam>
                  ) : (
                    bubble
                  )}
                </div>
              );
            })
          )}
          {isLoading && (
            <div className="flex items-center justify-start gap-2 px-4 py-3">
              <AgentStatusOrb state="working" size={20} label="AI 思考中" />
              <span className="text-[16px] text-white/30">思考中…</span>
            </div>
          )}
        </div>
      </div>

      {/* 中部：用户输入预览（星球下方） */}
      <div className={`flex items-start justify-center px-8 pb-2 min-h-[40px] transition-all duration-500 ease-in-out ${
        uiHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        {interimText && isRecording ? (
          <p className="text-sm text-cyan-300/60 animate-pulse text-center max-w-md font-mono tracking-wide">
            {interimText}
          </p>
        ) : lastUserMsg ? (
          <p className="text-[16px] text-white/25 text-center max-w-md truncate font-mono">
            ▸ {lastUserMsg.content}
          </p>
        ) : null}
      </div>

      {/* 记忆提示 */}
      {showMemoryToast && (
        <div className="px-8 pb-1 text-center">
          <span className="text-[16px] text-green-400/60 animate-fade-in">{memoryToastText}</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="px-8 pb-1 text-center">
          <span className="text-[16px] text-red-400/60">{error}</span>
        </div>
      )}

      {/* TTS 错误（含重播） */}
      {ttsError && !error && (
        <div className="px-8 pb-1 text-center">
          <button onClick={replayTTS} className="text-[16px] text-red-400/60 hover:text-red-300 pointer-events-auto">
            {ttsError} · ▶ 重播
          </button>
        </div>
      )}

      {/* 录音指示器 */}
      {isRecording && (
        <div className="px-8 pb-1 flex items-center justify-center gap-3">
          <AgentStatusOrb state="listening" size={20} label="聆听中" />
          <AudioVisualizer mode="bars" level={recordingVolume} isActive color="#ef4444" width={160} height={16} />
          <span className="text-[16px] text-red-300/80">{recordingDuration}s</span>
        </div>
      )}

      {/* 底部输入栏（NeonInputBar：黑色主题 + 环绕彩灯 + 按钮内嵌；始终显示不被隐藏，水平居中） */}
      <div className="flex justify-center px-4 pb-5 pt-2 pointer-events-auto">
        <NeonInputBar
          text={text}
          onTextChange={setText}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? '输入消息…' : '正在连接…'}
          disabled={!isConnected}
          isRecording={isRecording}
          isSpeaking={isSpeaking}
          isLoading={isLoading}
          onMicDown={() => { if (isConnected) startRecording(); }}
          onMicUp={stopRecording}
          onMicLeave={() => { if (isRecording) stopRecording(); }}
          onStop={stopAll}
          onSend={handleSend}
          canSend={!!text.trim() && isConnected}
          projectDir={projectDir}
          permission={permission}
          onPickProject={onPickProject}
          onTogglePermission={onTogglePermission}
        />
      </div>
    </div>
  );
}
