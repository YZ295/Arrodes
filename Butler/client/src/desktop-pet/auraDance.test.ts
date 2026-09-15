// T8 编舞选择器与逐帧参数（纯函数，无 WebGL 依赖）
// 法律约束：技法参考 Terse-AI terse-field 公开思路，实现为原创，未搬运源码
import { describe, expect, it } from 'vitest';
import { computeAuraFrame, selectAuraDance } from './auraDance';

describe('selectAuraDance（T8）', () => {
  it('muted 最高优先（压过 thinking/speaking/observing）', () => {
    expect(selectAuraDance({ voice: 'muted', observing: true })).toBe('still');
  });

  it('thinking → pulse（压过 speaking）', () => {
    expect(selectAuraDance({ voice: 'thinking', observing: true })).toBe('pulse');
  });

  it('speaking → ripple', () => {
    expect(selectAuraDance({ voice: 'speaking', observing: false })).toBe('ripple');
  });

  it('listening（对话余温）→ shimmer', () => {
    expect(selectAuraDance({ voice: 'listening', observing: false })).toBe('shimmer');
  });

  it('静默在场但屏幕观察中 → shimmer（观察微光）', () => {
    expect(selectAuraDance({ voice: 'ambient', observing: true })).toBe('shimmer');
  });

  it('静默在场且未观察 → breathe', () => {
    expect(selectAuraDance({ voice: 'ambient', observing: false })).toBe('breathe');
  });
});

describe('computeAuraFrame（T8）', () => {
  const dances = ['still', 'breathe', 'shimmer', 'pulse', 'ripple'] as const;

  it('所有舞步的 intensity 都在 [0,1]，ringPhase 在 [0,1)', () => {
    for (const dance of dances) {
      for (let t = 0; t < 10_000; t += 137) {
        const frame = computeAuraFrame(dance, t);
        expect(frame.intensity).toBeGreaterThanOrEqual(0);
        expect(frame.intensity).toBeLessThanOrEqual(1);
        expect(frame.ringPhase).toBeGreaterThanOrEqual(0);
        expect(frame.ringPhase).toBeLessThan(1);
        expect(frame.color.every((c) => c >= 0 && c <= 1)).toBe(true);
      }
    }
  });

  it('呼吸减慢：still 的 speed 低于 breathe，breathe 低于 pulse', () => {
    expect(computeAuraFrame('still', 0).speed).toBeLessThan(computeAuraFrame('breathe', 0).speed);
    expect(computeAuraFrame('breathe', 0).speed).toBeLessThan(computeAuraFrame('pulse', 0).speed);
  });

  it('脉动幅度大于呼吸', () => {
    const pulseAmp = Math.max(...[0, 175, 350, 525].map((t) => computeAuraFrame('pulse', t).intensity))
      - Math.min(...[0, 175, 350, 525].map((t) => computeAuraFrame('pulse', t).intensity));
    const breatheAmp = Math.max(...[0, 600, 1200, 1800].map((t) => computeAuraFrame('breathe', t).intensity))
      - Math.min(...[0, 600, 1200, 1800].map((t) => computeAuraFrame('breathe', t).intensity));
    expect(pulseAmp).toBeGreaterThan(breatheAmp);
  });

  it('ripple 的 ringPhase 按周期回卷（t 与 t+周期 同值）', () => {
    const a = computeAuraFrame('ripple', 5_000);
    const b = computeAuraFrame('ripple', 5_000 + 1_200);
    expect(b.ringPhase).toBeCloseTo(a.ringPhase, 5);
  });

  it('不同舞步颜色不同（状态可辨识）', () => {
    const colors = new Set(dances.map((d) => computeAuraFrame(d, 0).color.join(',')));
    expect(colors.size).toBe(dances.length);
  });
});
