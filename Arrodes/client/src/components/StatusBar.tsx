/**
 * 顶部状态栏（借鉴主流桌面 Agent：Codex / ChatGPT / Hermes）
 * 显示：连接状态、TTS 引擎（本地）、语音播报状态
 * 轻量、半透明、不遮挡内容
 */
import { memo } from 'react';
import AgentStatusOrb from './AgentStatusOrb';

interface StatusBarProps {
  isConnected: boolean;
  isSpeaking: boolean;
  ttsError: string | null;
  /** 对话界面是否隐藏 */
  uiHidden: boolean;
  /** 切换对话界面显隐 */
  onToggleUi: () => void;
  /** 静音状态 */
  isMuted: boolean;
  /** 切换静音 */
  onToggleMuted: () => void;
}

export default memo(function StatusBar({ isConnected, isSpeaking, ttsError, uiHidden, onToggleUi, isMuted, onToggleMuted }: StatusBarProps) {
  return (
    <div className="pointer-events-auto flex items-center justify-between px-6 pt-3 pb-1 shrink-0">
      {/* 左侧：连接 + 语音状态 */}
      <div className="flex items-center gap-3 text-[16px] text-white/35">
        {/* 连接状态 */}
        <span className="flex items-center gap-1.5">
          {!isConnected && <AgentStatusOrb state="connecting" size={20} label="连接中" />}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
            }`}
          />
          {isConnected ? '已连接' : '连接中'}
        </span>

        {/* 语音状态 */}
        {isSpeaking && (
          <span className="flex items-center gap-1.5 text-cyan-300/80">
            <svg className="w-3 h-3 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z" />
            </svg>
            播报中
          </span>
        )}
      </div>

      {/* 右侧：TTS 错误 + 静音 + 界面显隐 */}
      <div className="flex items-center gap-2">
        {ttsError && (
          <span className="text-[16px] text-red-400/70 bg-red-500/10 rounded-full px-2 py-0.5 truncate max-w-[40%]">
            {ttsError}
          </span>
        )}
        {/* 静音开关 */}
        <button
          onClick={onToggleMuted}
          className={`flex items-center gap-1 text-[16px] px-2 py-1 rounded-lg transition-all ${
            isMuted
              ? 'bg-blue-500/20 text-blue-300/90 hover:bg-blue-500/30'
              : 'bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/80'
          }`}
          title={isMuted ? '开启语音输出' : '关闭语音输出（静音）'}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isMuted ? (
              <path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M18.6 5.4a9 9 0 010 13.2" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          {isMuted ? '已静音' : '静音'}
        </button>
        {/* 对话界面显隐切换 */}
        <button
          onClick={onToggleUi}
          className="flex items-center gap-1 text-[16px] px-2 py-1 rounded-lg
            bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"
          title={uiHidden ? '显示对话界面' : '隐藏对话界面'}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {uiHidden ? (
              <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.24A9.9 9.9 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19M6.61 6.61A17.5 17.5 0 002 12s3 8 10 8a9.7 9.7 0 005.39-1.61" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}
          </svg>
          {uiHidden ? '显示' : '隐藏'}
        </button>
      </div>
    </div>
  );
});
