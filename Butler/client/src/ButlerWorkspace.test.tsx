// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./components/ButlerPanel', () => ({ ButlerPanel: () => <div>活动记录面板</div> }));
vi.mock('./components/ButlerPetPanel', () => ({ ButlerPetPanel: () => <div>桌宠面板</div> }));
vi.mock('./components/ModelSettings', () => ({ default: () => <div>模型面板</div> }));
vi.mock('./components/MemoryPanel', () => ({ default: () => <div>候选记忆审核面板</div> }));
vi.mock('./modules/vision/VisionPanel', () => ({ default: () => <div>视觉面板</div> }));
vi.mock('./modules/vision/useContinuousVision', () => ({
  useContinuousVision: () => ({ active: false, analyzing: false, error: null, observation: null, start: vi.fn(), stop: vi.fn() }),
  setObservationExclusion: vi.fn(), setExclusionReporter: vi.fn(), setSelfWindowVisible: vi.fn(), setVisionTickReporter: vi.fn(),
}));
vi.mock('./desktop-pet/desktopPetBridge', () => ({
  useDesktopPetPublisher: vi.fn(), usePetBoundsListener: vi.fn(), usePetCommandHandler: vi.fn(),
}));

import ButlerWorkspace from './ButlerWorkspace';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(window, 'arrodesButler', { configurable: true, value: undefined });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('ButlerWorkspace 记忆审核入口', () => {
  it('从控制台导航进入记忆审核面板', async () => {
    await act(async () => root.render(<ButlerWorkspace />));
    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === '记忆审核');
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(container.textContent).toContain('候选记忆审核面板');
  });
});
