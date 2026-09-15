import { describe, expect, it } from 'vitest';
import { getWorkspaceLayout } from './layoutPolicy';

describe('getWorkspaceLayout', () => {
  it('keeps the main task usable on a 390px viewport', () => {
    expect(getWorkspaceLayout(390, false)).toEqual({ compactNavigation: true, panelPresentation: 'full' });
  });

  it('respects the user collapse choice on desktop', () => {
    expect(getWorkspaceLayout(1440, false).compactNavigation).toBe(false);
    expect(getWorkspaceLayout(1440, true).compactNavigation).toBe(true);
  });
});
