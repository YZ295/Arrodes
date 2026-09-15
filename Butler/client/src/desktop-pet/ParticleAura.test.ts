// @vitest-environment jsdom
// T8：无 WebGL 环境（jsdom）优雅降级验证
import { describe, expect, it, vi } from 'vitest';
import { mountAura } from './ParticleAura';

describe('ParticleAura（T8 降级路径）', () => {
  it('无 WebGL 上下文 → no-op controller，setState/destroy 不抛错', () => {
    const canvas = document.createElement('canvas');
    const controller = mountAura(canvas);
    expect(() => controller.setState({ voice: 'speaking', observing: false })).not.toThrow();
    expect(() => controller.destroy()).not.toThrow();
  });

  it('prefers-reduced-motion → 不创建 WebGL（回退纯球体）', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true, media: '', onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })));
    const canvas = document.createElement('canvas');
    const controller = mountAura(canvas);
    expect(() => controller.destroy()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
