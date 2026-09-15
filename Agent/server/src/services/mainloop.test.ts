/**
 * mainloop 主循环测试
 * - runTick：到期提醒推送 + 状态递增
 * - 记忆整理触发（每 3 次 tick）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTick, getMainloopState } from './mainloop.js';

// 注入 mock：提醒无到期 + 记忆整理无重复（避免真实 DB 依赖）
vi.mock('../skills/reminder.js', () => ({
  pollDueReminders: vi.fn(() => []),
}));
vi.mock('./MemoryGateway.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./MemoryGateway.js')>();
  return {
    ...actual,
    consolidateMemories: vi.fn(async () => ({ scanned: 0, removed: 0 })),
  };
});

describe('mainloop runTick', () => {
  beforeEach(() => {
    // 重置内部状态：通过多次 tick 自然验证递增
  });

  it('tick 递增计数并记录时间', async () => {
    const before = getMainloopState().tickCount;
    await runTick(null, Date.now());
    expect(getMainloopState().tickCount).toBe(before + 1);
    expect(getMainloopState().lastTickAt).not.toBeNull();
  });

  it('连续 3 次 tick 触发记忆整理（lastConsolidate 被填充）', async () => {
    await runTick(null, Date.now()); // 1
    await runTick(null, Date.now()); // 2
    const state = await runTick(null, Date.now()); // 3 → 触发整理
    expect(state.lastConsolidate).not.toBeNull();
  });

  it('reminder 无到期时不抛异常（静默）', async () => {
    await expect(runTick(null, Date.now())).resolves.not.toThrow();
  });
});
