// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolvePetExpression, resolvePetTapMotion, startLive2dPet } from './live2dPet';

describe('live2d pet state mapping', () => {
  it('does not load third-party scripts or create a canvas without an assigned model', async () => {
    const container = document.createElement('div');
    expect(await startLive2dPet(container, '')).toBeNull();
    expect(container.children.length).toBe(0);
    expect(document.querySelector('script[data-live2d-core]')).toBeNull();
  });
  it('maps each pet tone to a distinct Mao expression and idle to none', () => {
    const names = ['idle', 'ready', 'working', 'uncertain', 'error'].map(
      (tone) => resolvePetExpression(tone as Parameters<typeof resolvePetExpression>[0]),
    );
    expect(names[0]).toBeNull();
    expect(new Set(names.slice(1)).size).toBe(4);
    for (const name of names.slice(1)) {
      expect(name).toMatch(/^exp_\d{2}$/);
    }
  });

  it('always picks tap motions from the available Mao motion groups', () => {
    expect(['TapBody', 'Idle']).toContain(resolvePetTapMotion());
  });
});
