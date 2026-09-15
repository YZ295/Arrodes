/**
 * T8 光环编舞：舞步选择 + 逐帧参数（纯函数）
 *
 * 五种舞步对应在场陪伴的五种状态：
 * - still    静音（呼吸减慢）
 * - breathe  静默在场（缓慢呼吸）
 * - shimmer  倾听/屏幕观察（微光闪烁）
 * - pulse    思考中（脉动）
 * - ripple   说话中（涟漪扩散）
 *
 * 法律约束：分层/编排/降级思路参考 Terse-AI terse-field 公开技法，本实现为原创。
 */

export type AuraDanceId = 'still' | 'breathe' | 'shimmer' | 'pulse' | 'ripple';

export type AuraVoiceState = 'ambient' | 'listening' | 'thinking' | 'speaking' | 'muted';

export interface AuraInput {
  voice: AuraVoiceState;
  /** 屏幕观察运行中（微光语义） */
  observing: boolean;
}

export interface AuraFrame {
  /** 整体亮度/幅度 0..1 */
  intensity: number;
  /** 运动速度系数 */
  speed: number;
  /** 涟漪展开相位 0..1（非 ripple 舞步恒 0） */
  ringPhase: number;
  /** 光环颜色 [r,g,b] 0..1（premultiplied 前的线性色） */
  color: [number, number, number];
}

const TAU = Math.PI * 2;

export function selectAuraDance(input: AuraInput): AuraDanceId {
  if (input.voice === 'muted') return 'still';
  if (input.voice === 'thinking') return 'pulse';
  if (input.voice === 'speaking') return 'ripple';
  if (input.voice === 'listening' || input.observing) return 'shimmer';
  return 'breathe';
}

const COLORS: Record<AuraDanceId, [number, number, number]> = {
  still: [0.30, 0.45, 0.70],
  breathe: [0.42, 0.68, 1.00],
  shimmer: [0.35, 0.90, 0.85],
  pulse: [1.00, 0.72, 0.35],
  ripple: [0.68, 0.55, 1.00],
};

export function computeAuraFrame(dance: AuraDanceId, tMs: number): AuraFrame {
  const t = tMs / 1000;
  switch (dance) {
    case 'still':
      return { intensity: clamp01(0.18 + 0.05 * Math.sin((t * TAU) / 6)), speed: 0.3, ringPhase: 0, color: COLORS.still };
    case 'breathe':
      return { intensity: clamp01(0.35 + 0.10 * Math.sin((t * TAU) / 2.4)), speed: 0.6, ringPhase: 0, color: COLORS.breathe };
    case 'shimmer':
      return { intensity: clamp01(0.32 + 0.12 * Math.sin(t * 7.3) * Math.sin(t * 2.1)), speed: 0.9, ringPhase: 0, color: COLORS.shimmer };
    case 'pulse':
      return { intensity: clamp01(0.55 + 0.28 * Math.sin((t * TAU) / 0.7)), speed: 1.4, ringPhase: 0, color: COLORS.pulse };
    case 'ripple':
      return { intensity: 0.62, speed: 1.8, ringPhase: (t / 1.2) % 1, color: COLORS.ripple };
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
