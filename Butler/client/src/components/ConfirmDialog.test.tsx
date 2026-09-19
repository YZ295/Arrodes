// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../shared/utils/apiClient', () => ({ api: { get: apiGet, post: apiPost } }));

import ConfirmDialog from './ConfirmDialog';

const pending = {
  id: 'action-1', skill: 'delete_file', description: '删除 E:/project/demo.txt',
  risk: 'high', createdAt: Date.now(),
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  apiGet.mockReset().mockResolvedValue({ pending: [pending] });
  apiPost.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderDialog(onAppendAssistant = vi.fn()) {
  await act(async () => root.render(
    <ConfirmDialog
      messages={[{ id: 'message-1', content: '需要确认' }] as never}
      sessionId="session-1"
      onAppendAssistant={onAppendAssistant}
    />,
  ));
  await act(async () => {});
  return onAppendAssistant;
}

describe('ConfirmDialog 高风险操作闭环', () => {
  it('展示操作类型与目标说明', async () => {
    await renderDialog();
    expect(container.textContent).toContain('删除 E:/project/demo.txt');
    expect(container.textContent).toContain('delete_file');
  });

  it('确认成功后关闭并回传执行结果', async () => {
    apiPost.mockResolvedValue({ result: '文件已移至回收站' });
    const append = await renderDialog();
    const button = container.querySelector('[data-role="action-confirm"]') as HTMLButtonElement;
    await act(async () => button.click());
    await act(async () => {});
    expect(apiPost).toHaveBeenCalledWith('/actions/action-1/confirm', { sessionId: 'session-1' });
    expect(append).toHaveBeenCalledWith('文件已移至回收站');
    expect(container.textContent).toBe('');
  });

  it('确认失败时保留弹窗、显示错误并允许重试', async () => {
    apiPost.mockRejectedValueOnce(new Error('动作执行失败')).mockResolvedValueOnce({ result: '重试成功' });
    const append = await renderDialog();
    const confirm = container.querySelector('[data-role="action-confirm"]') as HTMLButtonElement;
    await act(async () => confirm.click());
    await act(async () => {});
    expect(container.textContent).toContain('动作执行失败');
    expect(container.textContent).toContain('删除 E:/project/demo.txt');
    expect(append).not.toHaveBeenCalled();

    await act(async () => confirm.click());
    await act(async () => {});
    expect(append).toHaveBeenCalledWith('重试成功');
    expect(apiPost).toHaveBeenCalledTimes(2);
  });

  it('取消成功后关闭且不执行确认接口', async () => {
    apiPost.mockResolvedValue({ ok: true });
    const append = await renderDialog();
    const cancel = container.querySelector('[data-role="action-cancel"]') as HTMLButtonElement;
    await act(async () => cancel.click());
    await act(async () => {});
    expect(apiPost).toHaveBeenCalledWith('/actions/action-1/cancel', { sessionId: 'session-1' });
    expect(append).toHaveBeenCalledWith('已取消该操作。');
    expect(container.textContent).toBe('');
  });

  it('取消失败时保留弹窗并允许重试', async () => {
    apiPost.mockRejectedValueOnce(new Error('取消请求失败')).mockResolvedValueOnce({ ok: true });
    const append = await renderDialog();
    const cancel = container.querySelector('[data-role="action-cancel"]') as HTMLButtonElement;
    await act(async () => cancel.click());
    await act(async () => {});
    expect(container.textContent).toContain('取消请求失败');
    expect(container.textContent).toContain('删除 E:/project/demo.txt');
    expect(append).not.toHaveBeenCalled();

    await act(async () => cancel.click());
    await act(async () => {});
    expect(append).toHaveBeenCalledWith('已取消该操作。');
    expect(apiPost).toHaveBeenCalledTimes(2);
  });
});
