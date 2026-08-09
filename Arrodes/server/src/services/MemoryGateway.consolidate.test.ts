/**
 * MemoryGateway 记忆整理（consolidate）测试
 * - computeDuplicateGroups：相似记忆分组（纯函数）
 * - 验证去重合并逻辑
 */
import { describe, it, expect } from 'vitest';
import { computeDuplicateGroups } from './MemoryGateway.js';
import type { MemoryRowWithSession } from '../db/memory-repo.js';

function mem(id: string, sessionId: string, content: string, type: string, createdAt: string): MemoryRowWithSession {
  return { id, sessionId, content, type: type as never, createdAt };
}

describe('computeDuplicateGroups', () => {
  it('完全相同的记忆判定为重复（保留较早）', () => {
    const memories = [
      mem('a', 's1', '用户喜欢咖啡', 'preference', '2026-08-08T10:00:00Z'),
      mem('b', 's1', '用户喜欢咖啡', 'preference', '2026-08-08T11:00:00Z'),
    ];
    const groups = computeDuplicateGroups(memories);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.id).toBe('a');      // 保留较早的
    expect(groups[0].remove.map((m) => m.id)).toEqual(['b']);
  });

  it('高度相似（仅少量措辞差异）判定为重复', () => {
    const memories = [
      mem('a', 's1', '用户喜欢喝咖啡', 'preference', '2026-08-08T10:00:00Z'),
      mem('b', 's1', '用户很喜欢喝咖啡', 'preference', '2026-08-08T11:00:00Z'),
    ];
    const groups = computeDuplicateGroups(memories);
    expect(groups.length).toBeGreaterThan(0);
  });

  it('同义换词（喜欢→爱）不误合并（保守阈值防误删）', () => {
    const memories = [
      mem('a', 's1', '用户喜欢喝咖啡', 'preference', '2026-08-08T10:00:00Z'),
      mem('b', 's1', '用户爱喝咖啡', 'preference', '2026-08-08T11:00:00Z'),
    ];
    // 语义略不同但字面重叠不高 → 0.85 阈值下不合并（宁可保留，防误删）
    expect(computeDuplicateGroups(memories)).toHaveLength(0);
  });

  it('不同内容不合并', () => {
    const memories = [
      mem('a', 's1', '用户喜欢咖啡', 'preference', '2026-08-08T10:00:00Z'),
      mem('b', 's1', '用户是程序员', 'fact', '2026-08-08T11:00:00Z'),
    ];
    expect(computeDuplicateGroups(memories)).toHaveLength(0);
  });

  it('不同会话或不同类型的记忆不合并', () => {
    const memories = [
      mem('a', 's1', '用户喜欢咖啡', 'preference', '2026-08-08T10:00:00Z'),
      mem('b', 's2', '用户喜欢咖啡', 'preference', '2026-08-08T11:00:00Z'), // 不同会话
      mem('c', 's1', '用户喜欢咖啡', 'fact', '2026-08-08T12:00:00Z'),        // 不同类型
    ];
    expect(computeDuplicateGroups(memories)).toHaveLength(0);
  });

  it('自定义阈值：低阈值下更多合并', () => {
    const memories = [
      mem('a', 's1', '用户喜欢喝咖啡', 'preference', '2026-08-08T10:00:00Z'),
      mem('b', 's1', '用户喜欢喝咖啡和茶并且爱读书', 'preference', '2026-08-08T11:00:00Z'),
    ];
    // 默认 0.75 不合并（B 长出一截，Dice 明显低）
    expect(computeDuplicateGroups(memories)).toHaveLength(0);
    // 阈值 0.4 合并（高度包含）
    const groups = computeDuplicateGroups(memories, 0.4);
    expect(groups.length).toBeGreaterThan(0);
  });
});
