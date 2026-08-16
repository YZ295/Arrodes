/**
 * NeonInputBar：一体式输入栏
 *
 * 视觉参照 DeepSeek Harness InputBar 与 Codex 桌面端输入框：
 * - 深黑圆角卡片（22px）+ 1px 细边框 + 轻阴影，聚焦时边框变蓝
 * - 上：无边框透明 textarea（蓝色光标、浅灰占位符、自动增高）
 * - 下：工具行 —— 左：项目/权限；右：停止/发送/语音（语音最右）
 */
import { memo, useRef, useEffect } from 'react';

interface NeonInputBarProps {
  text: string;
  onTextChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  isRecording: boolean;
  isSpeaking: boolean;
  isLoading: boolean;
  onMicDown: () => void;
  onMicUp: () => void;
  onMicLeave: () => void;
  onStop: () => void;
  onSend: () => void;
  canSend: boolean;
  projectDir?: string;
  permission?: 'default' | 'full';
  onPickProject: () => void;
  onTogglePermission: () => void;
}

export default memo(function NeonInputBar({
  text, onTextChange, onKeyDown, placeholder, disabled,
  isRecording, isSpeaking, isLoading,
  onMicDown, onMicUp, onMicLeave, onStop, onSend, canSend,
  projectDir, permission = 'default', onPickProject, onTogglePermission,
}: NeonInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动增高：随内容增长到 10 行（220px）封顶，超出滚动
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  return (
    <div className="w-full max-w-3xl">
      {/* 深黑圆角卡片：细边框 + 轻阴影，聚焦时边框与光晕变蓝 */}
      <div
        className="flex flex-col overflow-hidden rounded-[22px] border bg-[#17181b] transition-all duration-200
          border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.45)]
          focus-within:border-blue-500/60 focus-within:shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_8px_32px_rgba(0,0,0,0.45)]"
      >
        {/* 输入区：透明背景 + 蓝色光标 + 浅灰占位符 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder || '输入消息…'}
          disabled={disabled}
          rows={2}
          className="w-full bg-transparent px-4 pt-3.5 pb-1 text-[16px] leading-[24px] text-white
            placeholder:text-white/30 caret-[#3b82f6] outline-none resize-none
            max-h-[220px] overflow-y-auto disabled:opacity-30 min-w-0"
          style={{ minHeight: '72px' }}
        />

        {/* 工具行：左工具（项目/权限） + 右操作（停止/发送/语音最右） */}
        <div className="flex items-center justify-between gap-3 px-2.5 pb-2.5 pt-1 min-w-0">
          {/* 左：项目 + 权限 */}
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={onPickProject}
              title={`项目目录${projectDir ? `：${projectDir}` : '（未设置）'}`}
              className="h-8 px-3 rounded-full text-[13px] font-medium text-white/65 bg-white/5
                hover:bg-white/10 hover:text-white transition-colors flex items-center gap-1.5 shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              项目
            </button>
            <button
              onClick={onTogglePermission}
              title={permission === 'full' ? '全部权限：高风险操作自动执行' : '默认权限：高风险操作需确认'}
              className={`h-8 px-3 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5 shrink-0 ${
                permission === 'full'
                  ? 'text-blue-300 bg-blue-500/15 hover:bg-blue-500/25'
                  : 'text-white/65 bg-white/5 hover:bg-white/10 hover:text-white'
              }`}
            >
              {permission === 'full' ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.6 2A9 9 0 1111 4.4a7 7 0 019.6 9.6z" />
                </svg>
              )}
              {permission === 'full' ? '全部权限' : '默认权限'}
            </button>
          </div>

          {/* 右：停止 → 发送 → 语音（最右） */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 停止（思考/语音进行中时可用） */}
            <button
              onClick={onStop}
              disabled={!isSpeaking && !isLoading}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-25 ${
                isSpeaking || isLoading ? 'text-red-400 hover:bg-red-500/15' : 'text-white/50 hover:bg-white/10'
              }`}
              title="停止（语音 + 思考）"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>

            {/* 发送（可发送时蓝色实心圆钮） */}
            <button
              onClick={onSend}
              disabled={!canSend}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 ${
                canSend
                  ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb] shadow-lg shadow-blue-500/30 hover:-translate-y-0.5'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              } disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0`}
              title="发送"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>

            {/* 语音（最右；按住说话） */}
            <button
              onMouseDown={(e) => { e.preventDefault(); onMicDown(); }}
              onMouseUp={onMicUp}
              onMouseLeave={onMicLeave}
              disabled={disabled}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-30 ${
                isRecording
                  ? 'bg-red-600 text-white scale-105 shadow-lg shadow-red-500/40'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
              title={isRecording ? '松开发送' : '按住说话'}
            >
              {isRecording ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0M12 18v3M9 21h6" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
