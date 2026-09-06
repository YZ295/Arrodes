import { describe, expect, it, vi } from 'vitest';

describe('composer focus style', () => {
  it('lets the rounded composer own the focus treatment', async () => {
    const { readFileSync } = await vi.importActual<{
      readFileSync(path: URL, encoding: string): string;
    }>('node:fs');
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    const focusRule = css.match(
      /\.arrodes-composer-wrap textarea:focus,[\s\S]*?\.arrodes-composer-wrap textarea:focus-visible\s*\{([\s\S]*?)\}/,
    );

    expect(focusRule?.[1]).toContain('outline: none');
    expect(focusRule?.[1]).toContain('box-shadow: none');
  });
});
