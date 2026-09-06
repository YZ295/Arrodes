/**
 * BorderBeam 组件（借鉴 Jakubantalik/border-beam 的 line 变体原理）
 *
 * 实现原理（三件套）：
 * 1. @property 注册自定义属性（--beam-x/--beam-w/--beam-h）→ CSS 变量可被 @keyframes 插值动画
 * 2. radial-gradient 光束层 → 彩色径向渐变作为发光源
 * 3. 三层 mask + mask-composite（intersect + exclude）→ 只露出边框环（content-box 排除内部）
 *
 * 效果：彩色光点沿边框横向扫过（line 模式），适合输入框/搜索栏。
 * 通过 absolute 覆盖层实现，内容元素保持透明背景。
 */
import { memo, useId } from 'react';

interface BorderBeamProps {
  /** 边框宽度（px） */
  borderWidth?: number;
  /** 动画时长（s） */
  duration?: number;
  /** 颜色变体 */
  colorVariant?: 'colorful' | 'ocean' | 'sunset';
  /** 是否激活（false 时隐藏光束） */
  active?: boolean;
  /** 子元素（输入框等） */
  children: React.ReactNode;
  /** 圆角 */
  radius?: number;
  /** 自适应内容宽度（气泡用）；false = 撑满容器（输入框用） */
  fitContent?: boolean;
}

export default memo(function BorderBeam({
  borderWidth = 1.5,
  duration = 3.5,
  colorVariant = 'colorful',
  active = true,
  children,
  radius = 12,
  fitContent = false,
}: BorderBeamProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');

  // 三种配色（暗色主题专用，深色底上亮色光）
  const gradients: Record<string, string> = {
    colorful: `radial-gradient(ellipse calc(34px * var(--beam-w-${id})) calc(30px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 4px), rgba(255,50,100,0.9), transparent 60%),
      radial-gradient(ellipse calc(40px * var(--beam-w-${id})) calc(28px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 2px), rgba(56,189,248,0.8), transparent 65%),
      radial-gradient(ellipse calc(30px * var(--beam-w-${id})) calc(26px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 1px), rgba(250,204,21,0.7), transparent 60%)`,
    ocean: `radial-gradient(ellipse calc(34px * var(--beam-w-${id})) calc(30px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 4px), rgba(56,189,248,0.9), transparent 60%),
      radial-gradient(ellipse calc(36px * var(--beam-w-${id})) calc(26px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 2px), rgba(139,92,246,0.8), transparent 65%)`,
    sunset: `radial-gradient(ellipse calc(34px * var(--beam-w-${id})) calc(30px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 4px), rgba(249,115,22,0.9), transparent 60%),
      radial-gradient(ellipse calc(36px * var(--beam-w-${id})) calc(26px * var(--beam-h-${id})) at calc(var(--beam-x-${id}) * 100%) calc(100% + 2px), rgba(236,72,153,0.8), transparent 65%)`,
  };

  return (
    <div
      className={fitContent ? 'relative' : 'relative w-full flex-1'}
      style={{ borderRadius: radius, minWidth: fitContent ? undefined : 0, display: fitContent ? 'inline-block' : undefined }}
    >
      {/* 光束覆盖层（绝对定位，不占布局；pointer-events-none 不挡输入） */}
      <div
        aria-hidden
        data-beam={id}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          padding: borderWidth,
          background: gradients[colorVariant],
          WebkitMask: `
            radial-gradient(
              ellipse calc(90px * var(--beam-w-${id})) calc(64px * var(--beam-h-${id}))
              at calc(var(--beam-x-${id}) * 100%) 100%,
              white 0%, rgba(255,255,255,0.5) 45%, transparent 100%
            ),
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0)`,
          WebkitMaskComposite: 'source-in, xor',
          mask: `
            radial-gradient(
              ellipse calc(90px * var(--beam-w-${id})) calc(64px * var(--beam-h-${id}))
              at calc(var(--beam-x-${id}) * 100%) 100%,
              white 0%, rgba(255,255,255,0.5) 45%, transparent 100%
            ),
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0)`,
          maskComposite: 'intersect, exclude',
          pointerEvents: 'none',
          opacity: active ? 1 : 0,
          transition: 'opacity 0.4s ease',
          zIndex: 1,
        }}
      />
      {/* 内容层（输入框/气泡等） */}
      <div className={fitContent ? 'relative' : 'relative w-full'} style={{ zIndex: 2 }}>{children}</div>

      {/* 样式：注册可动画自定义属性 + 光束扫过动画 */}
      <style>{`
        @property --beam-x-${id} { syntax: '<number>'; initial-value: 0.06; inherits: false; }
        @property --beam-w-${id} { syntax: '<number>'; initial-value: 0.5; inherits: false; }
        @property --beam-h-${id} { syntax: '<number>'; initial-value: 1; inherits: false; }

        @keyframes beam-travel-${id} {
          0%   { --beam-x-${id}: 0.04; --beam-w-${id}: 0.45; }
          50%  { --beam-x-${id}: 0.5;  --beam-w-${id}: 1.6; }
          100% { --beam-x-${id}: 0.96; --beam-w-${id}: 0.45; }
        }
        @keyframes beam-breathe-${id} {
          0%, 100% { --beam-h-${id}: 0.7; }
          25%      { --beam-h-${id}: 1.3; }
        }
        [data-beam="${id}"] {
          animation:
            beam-travel-${id} ${duration}s cubic-bezier(0.45, 0, 0.55, 1) infinite,
            beam-breathe-${id} ${(duration * 1.4).toFixed(2)}s ease-in-out infinite;
          will-change: transform, opacity;
        }
      `}</style>
    </div>
  );
});
