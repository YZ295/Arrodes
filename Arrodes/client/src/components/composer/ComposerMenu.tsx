/**
 * ComposerMenu：输入栏通用下拉菜单（参照 DeepSeek Harness Menu 组件）
 *
 * 触发按钮 + 上浮面板（bottom-full，即菜单从卡片内向上展开，与 DSH 一致）；
 * 点击外部 / Escape 关闭。
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface ComposerMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: (open: boolean) => ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  widthClass?: string;
}

export default function ComposerMenu({
  open, onOpenChange, trigger, children,
  align = 'left', widthClass = 'w-64',
}: ComposerMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative shrink-0">
      {trigger(open)}
      {open && (
        <div
          className={`absolute bottom-full mb-2 z-50 ${align === 'right' ? 'right-0' : 'left-0'} ${widthClass}
            rounded-xl border border-white/10 bg-[#1c1d20] shadow-[0_16px_48px_rgba(0,0,0,0.65)]
            p-1 flex flex-col overflow-y-auto max-h-[min(360px,calc(100vh-96px))]`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
