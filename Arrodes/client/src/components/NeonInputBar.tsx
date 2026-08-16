/**
 * NeonInputBar：一体式输入栏（完整参照 DeepSeek Harness InputBar 结构）
 *
 * 结构（与 DSH InputBar 一致）：
 * - 深黑圆角卡片（22px、1px 细边框、轻阴影），水平居中
 * - 上：透明 textarea（蓝色光标、浅灰占位符、自动增高）
 * - 中间：已附加技能 chip（可逐个移除）
 * - 下：工具行 ——
 *     左：＋技能（最左）| 项目 | 模式（标准/PTC/创造/极简）| 权限（默认/全部）
 *     右：模型选择 | 停止 | 发送 | 语音（最右）
 */
import { memo, useRef, useEffect } from 'react';
import ModelSelect from './composer/ModelSelect';
import ModeSelect from './composer/ModeSelect';
import PermissionSelect, { type PermissionLevel } from './composer/PermissionSelect';
import SkillMenu from './composer/SkillMenu';

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
  permission: PermissionLevel;
  onPickProject: () => void;
  onSetPermission: (p: PermissionLevel) => void;
  attachedSkills: string[];
  onToggleSkill: (name: string) => void;
}

function FolderIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

export default memo(function NeonInputBar({
  text, onTextChange, onKeyDown, placeholder, disabled,
  isRecording, isSpeaking, isLoading,
  onMicDown, onMicUp, onMicLeave, onStop, onSend, canSend,
  projectDir, permission, onPickProject, onSetPermission,
  attachedSkills, onToggleSkill,
}: NeonInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动增高：随内容增长到 220px 封顶，超出滚动
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  return (
    <div className="w-full max-w-3xl">
      {/* 深黑圆角卡片（DSH InputBar .card：22px、细边框、轻阴影、聚焦蓝光） */}
      <div
        className="flex flex-col gap-2.5 rounded-[22px] border bg-[#17181b] transition-all duration-200
          border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.45)] pt-2.5
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
          className="w-full bg-transparent px-4 pt-1 pb-0.5 text-[16px] leading-[24px] text-white
            placeholder:text-white/30 caret-[#3b82f6] outline-none resize-none
            max-h-[220px] overflow-y-auto disabled:opacity-30 min-w-0"
          style={{ minHeight: '64px' }}
        />

        {/* 已附加技能 chips（随本条消息发送，可移除） */}
        {attachedSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4">
            {attachedSkills.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-200/90 pl-2.5 pr-1 h-6 text-[12px] font-medium"
              >
                {name}
                <button
                  type="button"
                  onClick={() => onToggleSkill(name)}
                  title={`移除 ${name}`}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-blue-200/60 hover:bg-white/15 hover:text-blue-100 transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 工具行（DSH .row：左工具 + 右操作） */}
        <div className="flex items-center justify-between gap-2 px-2 pb-2 min-w-0 flex-wrap">
          {/* 左：＋技能（最左）| 项目 | 模式 | 权限 */}
          <div className="flex items-center gap-1 min-w-0 flex-wrap">
            <SkillMenu attached={attachedSkills} onToggle={onToggleSkill} disabled={disabled} />
            <button
              type="button"
              onClick={onPickProject}
              title={`项目目录${projectDir ? `：${projectDir}` : '（未设置）'}`}
              className="h-8 px-2.5 rounded-full text-[13px] font-medium text-white/60
                hover:bg-white/10 hover:text-white/90 transition-colors flex items-center gap-1.5 shrink-0"
            >
              <FolderIcon />
              项目
            </button>
            <ModeSelect disabled={disabled} />
            <PermissionSelect permission={permission} onSetPermission={onSetPermission} disabled={disabled} />
          </div>

          {/* 右：模型 | 停止 | 发送 | 语音（最右） */}
          <div className="flex items-center gap-1 shrink-0">
            <ModelSelect disabled={disabled} />

            {/* 停止（思考/语音进行中时可用） */}
            <button
              type="button"
              onClick={onStop}
              disabled={!isSpeaking && !isLoading}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors disabled:opacity-25 ${
                isSpeaking || isLoading ? 'text-red-400 hover:bg-red-500/15' : 'text-white/50 hover:bg-white/10'
              }`}
              title="停止（语音 + 思考）"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>

            {/* 发送（可发送时蓝色实心圆钮，DSH .primary） */}
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 ${
                canSend
                  ? 'bg-[#3b82f6] text-white hover:bg-[#2563eb] shadow-lg shadow-blue-500/30 hover:-translate-y-0.5'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              } disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0`}
              title="发送"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>

            {/* 语音（最右；按住说话） */}
            <button
              type="button"
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
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
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
