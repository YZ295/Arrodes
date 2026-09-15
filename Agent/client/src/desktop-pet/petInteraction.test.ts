import { describe, expect, it } from 'vitest';
import {
  clampPetPosition,
  isClickGesture,
  pickPetReaction,
  PET_REACTIONS,
} from './petInteraction';

describe('clampPetPosition', () => {
  it('keeps the pet inside the viewport with a margin', () => {
    const viewport = { width: 1920, height: 1080 };
    const pet = { width: 420, height: 600 };
    expect(clampPetPosition({ x: -50, y: -50 }, viewport, pet)).toEqual({ x: 8, y: 8 });
    expect(clampPetPosition({ x: 5000, y: 5000 }, viewport, pet))
      .toEqual({ x: 1920 - 420 - 8, y: 1080 - 600 - 8 });
  });

  it('clamps to the margin even when the viewport is smaller than the pet', () => {
    const clamped = clampPetPosition({ x: 100, y: 100 }, { width: 200, height: 300 }, { width: 420, height: 600 });
    expect(clamped.x).toBe(8);
    expect(clamped.y).toBe(8);
  });
});

describe('isClickGesture', () => {
  it('accepts small and quick pointer sequences as clicks', () => {
    expect(isClickGesture({ totalDelta: 4, durationMs: 200 })).toBe(true);
  });

  it('rejects drags that move beyond the threshold or take too long', () => {
    expect(isClickGesture({ totalDelta: 40, durationMs: 200 })).toBe(false);
    expect(isClickGesture({ totalDelta: 2, durationMs: 2000 })).toBe(false);
  });
});

describe('pickPetReaction', () => {
  it('never repeats the previous line when alternatives exist', () => {
    const previous = PET_REACTIONS[0];
    for (let round = 0; round < 12; round++) {
      expect(pickPetReaction(previous)).not.toBe(previous);
    }
  });

  it('always returns a line from the reaction pool', () => {
    expect(PET_REACTIONS).toContain(pickPetReaction());
  });
});
