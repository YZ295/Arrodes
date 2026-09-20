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

  it('keeps a long reply scrollable inside the bubble instead of overflowing the window', async () => {
    const { readFileSync } = await vi.importActual<{
      readFileSync(path: URL, encoding: string): string;
    }>('node:fs');
    const css = readFileSync(new URL('./desktopPet.css', import.meta.url), 'utf8');
    const bubbleRule = css.match(/\.desktop-pet__bubble\s*\{([\s\S]*?)\}/)?.[1] || '';
    const scrollRule = css.match(/\.desktop-pet__bubble-scroll\s*\{([\s\S]*?)\}/)?.[1] || '';

    // 气泡必须限高并纵向排列，否则长回复会把面板撑出固定 600px 高的桌宠窗口
    expect(bubbleRule).toMatch(/max-height\s*:/);
    expect(bubbleRule).toMatch(/display:\s*flex/);
    expect(bubbleRule).toMatch(/flex-direction:\s*column/);

    // 滚动区必须真的可滚：overflow-y + min-height:0（flex 子项滚动的必要条件）
    expect(scrollRule).toMatch(/overflow-y:\s*auto/);
    expect(scrollRule).toMatch(/min-height:\s*0/);
  });
});
