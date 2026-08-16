/**
 * NeonInputBar：一体式霓虹输入栏
 *
 * 需求：黑色主题输入框 + 语音/发送按钮内嵌 + 环绕彩灯（流动+多色过渡）+ 水平居中 + 始终显示
 *
 * 彩灯实现（借鉴 border-beam 的 rotate 变体原理）：
 * - 外层容器 1.5px padding 层作为"边框"，背景 = 多色 conic-gradient（红→黄→绿→青→紫）
 * - mask: linear-gradient content-box / linear-gradient → xor → 只露出边框环
 * - @keyframes 旋转 conic 角度（--neon-angle），多色围绕旋转 = 流动彩灯 + 颜色平滑过渡
 * - 内部 = 深黑内容层 + 内嵌按钮
 */
import { memo, useId, useRef, useEffect } from 'react';

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
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动增高：随内容增长到 10 行（220px）封顶，超出滚动
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  return (
    <div className="relative w-full max-w-2xl" style={{ borderRadius: 18 }}>
      {/* 霓虹彩灯边框层（absolute 覆盖，mask xor 只露边框环；不裁剪内容层） */}
      <div
        data-neon={id}
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          padding: 2,
          borderRadius: 18,
          background: `conic-gradient(
            from var(--neon-angle-${id}),
            #3b82f6, #22d3ee, #6366f1, #8b5cf6, #3b82f6
          )`,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          zIndex: 3,
        }}
      >
        {/* 彩灯层内部不放任何内容（mask 会裁剪子元素） */}
      </div>

      {/* 内容层（独立于 mask，纯黑底 + 按钮 + 输入框） */}
      <div
        className="relative flex items-center gap-1 px-2 py-1.5"
        style={{ backgroundColor: '#000000', borderRadius: 16, zIndex: 2 }}
      >
          {/* 项目 + 权限（主输入栏快捷设置） */}
          <button
            onClick={onPickProject}
            title={`项目目录${projectDir ? `：${projectDir}` : '（未设置）'}`}
            className="shrink-0 px-2 h-10 rounded-xl text-[16px] text-white/60 hover:bg-white/15 hover:text-white/90 transition-all"
          >
            📁 项目
          </button>
          <button
            onClick={onTogglePermission}
            title={permission === 'full' ? '全部权限：高风险操作自动执行' : '默认权限：高风险操作需确认'}
            className={`shrink-0 px-2 h-10 rounded-xl text-[16px] transition-all ${
              permission === 'full'
                ? 'text-red-300/90 hover:bg-red-500/15'
                : 'text-white/60 hover:bg-white/15 hover:text-white/90'
            }`}
          >
            {permission === 'full' ? '⚡ 全部' : '🛡 默认'}
          </button>

          {/* 语音按钮（内嵌左侧，纯白图标） */}
          <button
            onMouseDown={(e) => { e.preventDefault(); onMicDown(); }}
            onMouseUp={onMicUp}
            onMouseLeave={onMicLeave}
            disabled={disabled}
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
              isRecording ? 'bg-red-600 scale-105 shadow-lg shadow-red-500/50' : 'hover:bg-white/15'
            } disabled:opacity-30`}
            style={{ color: '#ffffff' }}
            title={isRecording ? '松开发送' : '按住说话'}
          >
            {isRecording ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0M12 18v3M9 21h6" />
              </svg>
            )}
          </button>

          {/* 文字输入（纯黑背景，纯白文字；最多 10 行，超出滚动） */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder || '输入消息…'}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent px-1 py-2.5 text-[16px] leading-[22px] caret-white
              outline-none resize-none max-h-[220px] overflow-y-auto disabled:opacity-30 min-w-0"
            style={{ color: '#ffffff', backgroundColor: 'transparent', minHeight: '44px' }}
          />

          {/* 停止按钮（内嵌，运行时红色高亮，默认纯白） */}
          <button
            onClick={onStop}
            disabled={!isSpeaking && !isLoading}
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30 ${
              isSpeaking || isLoading ? 'hover:bg-red-500/15' : 'hover:bg-white/15'
            }`}
            style={{ color: isSpeaking || isLoading ? '#ff6b6b' : '#ffffff' }}
            title="停止（语音 + 思考）"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>

          {/* 发送按钮（内嵌右侧，纯白图标；可发送时青底白图） */}
          <button
            onClick={onSend}
            disabled={!canSend}
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30 ${
              canSend ? 'bg-gradient-to-br from-cyan-500 to-cyan-700 hover:from-cyan-400 hover:to-cyan-600' : 'hover:bg-white/15'
            }`}
            style={{ color: '#ffffff' }}
            title="发送"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>

      {/* 彩灯旋转动画（多色平滑过渡） */}
      <style>{`
        @property --neon-angle-${id} {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes neon-spin-${id} {
          from { --neon-angle-${id}: 0deg; }
          to   { --neon-angle-${id}: 360deg; }
        }
        [data-neon="${id}"] {
          animation: neon-spin-${id} 8s linear infinite;
          will-change: transform;
        }
      `}</style>
    </div>
  );
});
