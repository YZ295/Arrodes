/**
 * SidebarBeam：侧边栏右侧边框光束（借鉴 border-beam 原理）
 *
 * 用绝对定位覆盖层 + @property 动画，让彩色光点沿侧边栏右缘周期扫过。
 * 视觉上与输入框的 BorderBeam 呼应，形成统一的"阿罗德斯光束"语言。
 * 纯 CSS 动画（GPU 合成），pointer-events-none 不挡交互。
 */
import { memo } from 'react';

export default memo(function SidebarBeam() {
  const id = 'sb-beam';
  return (
    <>
      {/* 光束层：1px 宽，沿右缘竖向扫过 */}
      <div
        aria-hidden
        data-sb-beam={id}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: -1,
          width: 3,
          pointerEvents: 'none',
          zIndex: 45,
          background: `radial-gradient(ellipse calc(40px * var(--sb-y, 0.2)) 26px at 50% calc(var(--sb-y, 0.2) * 100%), rgba(56,189,248,0.9), transparent 70%)`,
          WebkitMask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
          WebkitMaskComposite: 'xor',
          mask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
          maskComposite: 'exclude',
          opacity: 0.85,
        }}
      />
      <style>{`
        @property --sb-y { syntax: '<number>'; initial-value: 0.1; inherits: false; }
        @keyframes sb-travel {
          0%   { --sb-y: 0.06; }
          50%  { --sb-y: 0.94; }
          100% { --sb-y: 0.06; }
        }
        [data-sb-beam="${id}"] {
          animation: sb-travel 7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
      `}</style>
    </>
  );
});
