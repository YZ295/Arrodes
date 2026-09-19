// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MemoryPanel from './MemoryPanel';

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

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

describe('MemoryPanel 候选记忆审核', () => {
  it('列出候选并可逐条确认', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/workspace/memories/pending')) {
        return jsonResponse(200, { memories: [{
          id: 'candidate-1', content: '用户偏好低门槛学习节奏', type: 'preference',
          source: 'screen', evidence: '屏幕观察 16:20', confidence: 0.91,
          createdAt: '2026-09-19T08:20:00.000Z', status: 'candidate',
        }] });
      }
      if (url.includes('/api/v1/workspace/memories/candidate-1/confirm') && init?.method === 'POST') {
        return jsonResponse(200, { memory: { id: 'candidate-1', status: 'confirmed' } });
      }
      if (url.includes('/api/v1/memories')) return jsonResponse(200, { memories: [], persons: [] });
      return jsonResponse(404, { error: 'not found' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => root.render(<MemoryPanel onClose={() => {}} />));
    await act(async () => {});

    expect(container.textContent).toContain('待审核');
    expect(container.textContent).toContain('用户偏好低门槛学习节奏');
    expect(container.textContent).toContain('屏幕观察 16:20');

    const confirmButton = container.querySelector('[data-role="memory-confirm"]') as HTMLButtonElement;
    expect(confirmButton).not.toBeNull();
    await act(async () => confirmButton.click());
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/workspace/memories/candidate-1/confirm',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(container.textContent).not.toContain('用户偏好低门槛学习节奏');
    expect(container.textContent).toContain('暂无待审核记忆');
  });

  it('拒绝失败时保留候选并显示错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/workspace/memories/pending')) {
        return jsonResponse(200, { memories: [{
          id: 'candidate-2', content: '未经确认的候选', type: 'note', source: 'external',
          createdAt: '2026-09-19T08:20:00.000Z', status: 'candidate',
        }] });
      }
      if (url.includes('/candidate-2/reject') && init?.method === 'POST') {
        return jsonResponse(500, { error: '审核服务暂不可用' });
      }
      if (url.includes('/api/v1/memories')) return jsonResponse(200, { memories: [], persons: [] });
      return jsonResponse(404, {});
    }));

    await act(async () => root.render(<MemoryPanel onClose={() => {}} />));
    await act(async () => {});
    const rejectButton = container.querySelector('[data-role="memory-reject"]') as HTMLButtonElement;
    await act(async () => rejectButton.click());
    await act(async () => {});

    expect(container.textContent).toContain('审核服务暂不可用');
    expect(container.textContent).toContain('未经确认的候选');
  });
});
