/**
 * PermissionSelect：权限选择器（参照 DeepSeek Harness PermissionSelect）
 *
 * 默认权限 / 全部权限两个选项；切换到「全部权限」需先勾选已知悉风险再启用
 * （对应 DSH 的 RiskConfirmation 确认弹层）。
 */
import { useEffect, useState } from 'react';
import ComposerMenu from './ComposerMenu';

export type PermissionLevel = 'default' | 'full';

interface PermissionSelectProps {
  permission: PermissionLevel;
  onSetPermission: (p: PermissionLevel) => void;
  disabled?: boolean;
}

function ShieldIcon({ filled }: { filled: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 ${filled ? 'text-blue-400' : 'text-white/45'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

export default function PermissionSelect({ permission, onSetPermission, disabled }: PermissionSelectProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [acked, setAcked] = useState(false);

  // 关闭菜单时复位确认层
  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setAcked(false);
    }
  }, [open]);

  const pick = (p: PermissionLevel) => {
    if (p === 'full') {
      setConfirming(true);
      setAcked(false);
      return;
    }
    onSetPermission('default');
    setOpen(false);
  };

  const confirmFull = () => {
    if (!acked) return;
    onSetPermission('full');
    setOpen(false);
  };

  return (
    <ComposerMenu
      open={open}
      onOpenChange={setOpen}
      widthClass="w-72"
      trigger={(isOpen) => (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((p) => !p)}
          title={permission === 'full' ? '全部权限：高风险操作自动执行' : '默认权限：高风险操作需确认'}
          className={`h-8 px-2.5 rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40 ${
            permission === 'full'
              ? 'text-red-300 bg-red-500/10 hover:bg-red-500/20'
              : 'text-white/60 hover:bg-white/10 hover:text-white/90'
          }`}
        >
          <ShieldIcon filled={permission === 'full'} />
          <span className="whitespace-nowrap">{permission === 'full' ? '全部权限' : '默认权限'}</span>
          <svg
            className={`w-3 h-3 text-white/40 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 12 12" fill="none" aria-hidden
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    >
      {confirming ? (
        <div className="px-2.5 py-3 flex flex-col gap-2.5">
          <div className="text-[13px] text-white/90 leading-snug">启用「全部权限」？高风险操作（写文件、执行命令、自我修改）将自动执行，不再逐项确认。</div>
          <label className="flex items-center gap-2 text-[12px] text-white/60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acked}
              onChange={(e) => setAcked(e.target.checked)}
              className="accent-red-500 w-3.5 h-3.5"
            />
            我已了解风险
          </label>
          <div className="flex items-center justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-7 px-3 rounded-lg text-[12px] text-white/60 hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!acked}
              onClick={confirmFull}
              className="h-7 px-3 rounded-lg text-[12px] font-medium bg-red-500/80 text-white hover:bg-red-500 transition-colors disabled:opacity-40"
            >
              启用
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => pick('default')}
            className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
              permission === 'default' ? 'text-white' : 'text-white/80 hover:bg-white/8'
            }`}
          >
            <ShieldIcon filled={permission === 'default'} />
            <span className="flex-1 min-w-0">
              <span className="block">默认权限</span>
              <span className="block text-[11px] text-white/35">高风险操作需确认后执行</span>
            </span>
            {permission === 'default' && (
              <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => pick('full')}
            className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
              permission === 'full' ? 'text-white' : 'text-white/80 hover:bg-white/8'
            }`}
          >
            <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M13 2L4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
            </svg>
            <span className="flex-1 min-w-0">
              <span className="block">全部权限</span>
              <span className="block text-[11px] text-white/35">高风险操作自动执行（需确认）</span>
            </span>
            {permission === 'full' && (
              <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </>
      )}
    </ComposerMenu>
  );
}
