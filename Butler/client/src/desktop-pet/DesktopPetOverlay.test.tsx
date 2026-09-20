// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopPetOverlay from './DesktopPetOverlay';

const chatMock = vi.hoisted(() => ({
  messages: { current: [] as Array<{ id: string; role: 'user' | 'pet'; content: string }> },
  speaking: { current: false },
  micMuted: { current: false },
  interrupt: vi.fn(),
  toggleMicMuted: vi.fn(),
  ball: { setEmotion: vi.fn(), handleAIMessage: vi.fn(), setGaze: vi.fn(), destroy: vi.fn() },
  auraSetState: vi.fn(),
  auraDestroy: vi.fn(),
}));

vi.mock('./ParticleAura', () => ({
  mountAura: vi.fn(() => ({ setState: chatMock.auraSetState, destroy: chatMock.auraDestroy })),
}));

vi.mock('./usePetChat', () => ({ usePetChat: () => ({
  messages: chatMock.messages.current, draft: '', thinking: false, error: null, recording: false,
  speaking: chatMock.speaking.current,
  micMuted: chatMock.micMuted.current, handsFree: true, listening: false, vadLevel: 0,
  lastVoiceActivityAt: null,
  interrupt: chatMock.interrupt, toggleMicMuted: chatMock.toggleMicMuted,
  setDraft: vi.fn(), sendDraft: vi.fn(), startVoice: vi.fn(), stopVoice: vi.fn(),
  setHandsFree: vi.fn(),
}) }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  chatMock.speaking.current = false;
  chatMock.micMuted.current = false;
  chatMock.messages.current = [];
  chatMock.interrupt.mockClear();
  chatMock.toggleMicMuted.mockClear();
  chatMock.auraSetState.mockClear();
  chatMock.auraDestroy.mockClear();
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

  it('keeps a long reply in a keyboard-scrollable region above the composer', async () => {
    const longReply = '很长的本地模型回复。'.repeat(80);
    chatMock.messages.current = [{ id: 'long-reply', role: 'pet', content: longReply }];

    await act(async () => root.render(<DesktopPetOverlay />));
    await act(async () => (container.querySelector('[data-role="chat-toggle"]') as HTMLButtonElement).click());

    const scrollRegion = container.querySelector('[data-role="bubble-scroll"]') as HTMLElement | null;
    const composer = container.querySelector('[data-role="chatbar"]');
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion?.getAttribute('tabindex')).toBe('0');
    expect(scrollRegion?.getAttribute('aria-label')).toBe('桌宠回复内容');
    expect(scrollRegion?.textContent).toContain(longReply);
    expect(scrollRegion?.contains(composer)).toBe(false);
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
        model: 'qwen3-vl:4b-instruct',
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
    expect(diagnostics?.getAttribute('title')).toContain('qwen3-vl:4b-instruct');
    expect(diagnostics?.getAttribute('title')).toContain('2026-09-07T12:00:00.000Z');
  });

  it('T4: 播报中点击球体 → 打断（不切换静音）', async () => {
    chatMock.speaking.current = true;
    await act(async () => root.render(<DesktopPetOverlay />));
    const avatar = container.querySelector('[data-role="pet-avatar"]')!;
    await act(async () => avatar.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 100 })));
    await act(async () => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(chatMock.interrupt).toHaveBeenCalledTimes(1);
    expect(chatMock.toggleMicMuted).not.toHaveBeenCalled();
  });

  it('T4: 非播报中点击球体 → 切换麦克风静音（不触发打断）', async () => {
    await act(async () => root.render(<DesktopPetOverlay />));
    const avatar = container.querySelector('[data-role="pet-avatar"]')!;
    await act(async () => avatar.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 100 })));
    await act(async () => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })));
    expect(chatMock.toggleMicMuted).toHaveBeenCalledTimes(1);
    expect(chatMock.interrupt).not.toHaveBeenCalled();
  });

  it('T9: 小球表情随语音会话态切换（ambient=02 / muted=04）', async () => {
    (window as unknown as { EmotionBall: unknown }).EmotionBall = { create: () => chatMock.ball };
    await act(async () => root.render(<DesktopPetOverlay />));
    await flush();
    expect(chatMock.ball.handleAIMessage).toHaveBeenCalledWith(expect.objectContaining({ emotionId: '02' }));

    chatMock.micMuted.current = true;
    chatMock.ball.handleAIMessage.mockClear();
    await act(async () => root.render(<DesktopPetOverlay initialSnapshot={undefined} />));
    await flush();
    expect(chatMock.ball.handleAIMessage).toHaveBeenCalledWith(expect.objectContaining({ emotionId: '04' }));
    delete (window as unknown as { EmotionBall?: unknown }).EmotionBall;
  });

  it('T8: 光环画布挂载且随语音会话态更新', async () => {
    (window as unknown as { EmotionBall: unknown }).EmotionBall = { create: () => chatMock.ball };
    await act(async () => root.render(<DesktopPetOverlay />));
    await flush();
    expect(container.querySelector('[data-role="pet-aura"]')).not.toBeNull();
    expect(chatMock.auraSetState).toHaveBeenCalledWith(expect.objectContaining({ voice: 'ambient', observing: false }));

    chatMock.speaking.current = true;
    await act(async () => root.render(<DesktopPetOverlay />));
    await flush();
    expect(chatMock.auraSetState).toHaveBeenCalledWith(expect.objectContaining({ voice: 'speaking' }));
    delete (window as unknown as { EmotionBall?: unknown }).EmotionBall;
  });
});

function flush() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
