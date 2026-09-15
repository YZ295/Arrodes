import { describe, expect, it, vi } from 'vitest';

describe('desktop pet composition', () => {
  it('keeps the speech bubble narrow enough to leave the character face visible', async () => {
    const { readFileSync } = await vi.importActual<{
      readFileSync(path: URL, encoding: string): string;
    }>('node:fs');
    const css = readFileSync(new URL('./desktopPet.css', import.meta.url), 'utf8');
    const bubbleRule = css.match(/\.desktop-pet__bubble\s*\{([\s\S]*?)\}/)?.[1] || '';
    const width = Number(bubbleRule.match(/\bwidth:\s*(\d+)px/)?.[1]);

    expect(width).toBeGreaterThanOrEqual(210);
    expect(width).toBeLessThanOrEqual(224);
  });
});
