// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopPetOverlay from './DesktopPetOverlay';

vi.mock('./usePetChat', () => ({ usePetChat: () => ({
  messages: [], draft: '', thinking: false, error: null, recording: false,
  setDraft: vi.fn(), sendDraft: vi.fn(), startVoice: vi.fn(), stopVoice: vi.fn(),
}) }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('DesktopPetOverlay', () => {
  it('opens the input and microphone for an empty conversation', async () => {
    await act(async () => root.render(<DesktopPetOverlay />));
    await act(async () => (container.querySelector('[data-role="chat-toggle"]') as HTMLButtonElement).click());
    expect(container.querySelector('input[aria-label="桌宠对话输入"]')).not.toBeNull();
    expect(container.querySelector('[data-role="pet-mic"]')).not.toBeNull();
  });

  it('moves from the original position without accumulating total displacement', async () => {
    localStorage.clear();
    await act(async () => root.render(<DesktopPetOverlay />));
    const avatar = container.querySelector('[data-role="pet-avatar"]')!;
    await act(async () => avatar.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 100 })));
    await act(async () => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 120 })));
    await act(async () => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 140 })));
    await act(async () => window.dispatchEvent(new MouseEvent('pointerup')));
    const pet = container.querySelector('main')!;
    expect(pet.style.left).toBe('40px');
    expect(pet.style.top).toBe('40px');
    localStorage.clear();
  });

  it('renders the current app, state and only one next action', async () => {
    await act(async () => root.render(<DesktopPetOverlay initialSnapshot={{
      active: true,
      analyzing: false,
      error: null,
      observation: {
        description: '正在开发桌宠界面',
        durationMs: 1234,
        model: 'microsoft/Mage-VL',
        observedAt: '2026-09-07T12:00:00.000Z',
        activeApplication: 'Visual Studio Code',
        contextKind: 'development',
        currentState: '正在编辑 DesktopPetOverlay.tsx',
        nextSuggestion: '先运行桌宠界面测试',
        confidence: 0.9,
        uncertainties: [],
      },
    }} />));

    expect(container.querySelector('[aria-label="阿罗德斯桌面管家"]')).not.toBeNull();
    expect(container.textContent).toContain('Visual Studio Code');
    expect(container.textContent).toContain('正在编辑 DesktopPetOverlay.tsx');
    expect(container.textContent).toContain('先运行桌宠界面测试');
    expect(container.querySelectorAll('[data-role="next-action"]')).toHaveLength(1);

    const diagnostics = container.querySelector('[data-role="diagnostics"]');
    expect(diagnostics?.textContent).toBe('1.2s');
    expect(diagnostics?.getAttribute('title')).toContain('microsoft/Mage-VL');
    expect(diagnostics?.getAttribute('title')).toContain('2026-09-07T12:00:00.000Z');
  });
});
