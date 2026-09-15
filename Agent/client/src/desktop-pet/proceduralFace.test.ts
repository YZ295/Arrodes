import { describe, expect, it } from 'vitest';
import { resolvePetFace } from './proceduralFace';

describe('procedural pet face mapping', () => {
  it('gives every tone a complete face', () => {
    for (const tone of ['idle', 'ready', 'working', 'uncertain', 'error'] as const) {
      const face = resolvePetFace(tone);
      expect(face.eyes).toBeTruthy();
      expect(face.mouth).toBeTruthy();
      expect(face.blush).toBeGreaterThanOrEqual(0);
      expect(face.blush).toBeLessThanOrEqual(1);
      expect(face.ahoge).toBeGreaterThanOrEqual(0);
      expect(face.ahoge).toBeLessThanOrEqual(1);
    }
  });

  it('is expressive: tones differ in eyes or mouth', () => {
    const faces = (['idle', 'ready', 'working', 'uncertain', 'error'] as const)
      .map((tone) => resolvePetFace(tone));
    const signatures = new Set(faces.map((f) => `${f.eyes}/${f.mouth}`));
    expect(signatures.size).toBe(5);
  });

  it('marks uncertain and error with sweat, calm tones without', () => {
    expect(resolvePetFace('uncertain').sweat).toBe(true);
    expect(resolvePetFace('error').sweat).toBe(true);
    expect(resolvePetFace('idle').sweat).toBe(false);
    expect(resolvePetFace('ready').sweat).toBe(false);
  });
});
