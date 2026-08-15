/**
 * AgentStatusOrb：AI 等待状态指示器（借鉴 thinking-orbs）
 *
 * 在 AI 思考/输出/录音/连接等"让用户等待"的状态下，
 * 显示对应的点阵状态球动画（替代单调的三点闪烁）：
 * - AI 思考中   → working（粒子沿倾斜轨道运动）
 * - AI 输出中   → composing（波带）
 * - 录音中      → listening（波形扫过光环）
 * - 连接中      → connecting（星座连线）
 *
 * 状态色联动（HoloJarvis 借鉴：反应堆随状态变色）：
 * 外层彩色光晕随状态变化——聆听蓝 / 思考金 / 说话青 / 连接紫，
 * 让用户一眼感知当前 Agent 状态。
 *
 * 纯 2D Canvas 渲染（thinking-orbs 内核），跨浏览器一致、低端设备流畅。
 */
import { memo } from 'react';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';

export type AgentOrbState = 'working' | 'composing' | 'listening' | 'connecting';

interface AgentStatusOrbProps {
  /** 当前状态 */
  state: AgentOrbState;
  /** 尺寸（64=头像级 / 20=行内级），默认 20（对话内嵌） */
  size?: 64 | 20;
  /** 是否暂停动画 */
  paused?: boolean;
  /** 无障碍标签 */
  label?: string;
}

const ORB_MAP: Record<AgentOrbState, OrbState> = {
  working: 'working',
  composing: 'composing',
  listening: 'listening',
  connecting: 'connecting',
};

/** 状态色（HoloJarvis 反应堆变色理念）：聆听蓝 / 思考金 / 说话青 / 连接紫 */
const STATE_COLOR: Record<AgentOrbState, string> = {
  listening: 'rgba(56, 189, 248, 0.35)',  // 天蓝（聆听）
  working: 'rgba(59, 130, 246, 0.35)',    // 蓝（思考）
  composing: 'rgba(34, 211, 238, 0.35)',  // 青（说话/输出）
  connecting: 'rgba(168, 85, 247, 0.35)', // 紫（连接）
};

export default memo(function AgentStatusOrb({
  state,
  size = 20,
  paused = false,
  label,
}: AgentStatusOrbProps) {
  const color = STATE_COLOR[state];
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      title={label}
    >
      {/* 状态色光晕层 */}
      <div
        aria-hidden
        className="absolute rounded-full transition-colors duration-500"
        style={{
          inset: -size * 0.28,
          background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        }}
      />
      <ThinkingOrb
        state={ORB_MAP[state]}
        size={size}
        theme="dark"
        paused={paused}
        aria-label={label || `AI 正在${state === 'working' ? '思考' : state === 'listening' ? '聆听' : state === 'connecting' ? '连接' : '输出'}`}
      />
    </div>
  );
});
