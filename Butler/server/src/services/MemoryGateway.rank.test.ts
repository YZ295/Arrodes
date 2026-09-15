/**
 * MemoryGateway 阶段2 测试：召回排序 + 人物识别
 */
import { describe, it, expect } from 'vitest';
import { rankMemories, extractPersonEntities } from './MemoryGateway.js';
import type { MemoryRowWithSession } from '../db/memory-repo.js';

function mem(id: string, content: string, createdAt: string): MemoryRowWithSession {
  return { id, sessionId: 's1', content, type: 'fact', createdAt };
}

describe('rankMemories（召回排序）', () => {
  const now = Date.parse('2026-08-08T12:00:00Z');

  it('关键词命中多的排前面', () => {
    const memories = [
      mem('a', '用户喜欢咖啡', '2026-08-08T11:00:00Z'),
      mem('b', '用户喜欢咖啡和编程', '2026-08-08T11:00:00Z'),
    ];
    const ranked = rankMemories(memories, ['咖啡', '编程'], now);
    expect(ranked[0].id).toBe('b'); // 命中 2 词
  });

  it('时间衰减：同样命中时更新的排前面', () => {
    const memories = [
      mem('a', '用户喜欢咖啡', '2026-08-01T00:00:00Z'), // 7 天前
      mem('b', '用户喜欢咖啡', '2026-08-08T11:00:00Z'), // 1 小时前
    ];
    const ranked = rankMemories(memories, ['咖啡'], now);
    expect(ranked[0].id).toBe('b');
  });

  it('命中词数优先于时间（相关性主导）', () => {
    const memories = [
      mem('a', '用户喜欢咖啡', '2026-08-08T11:50:00Z'), // 很新但只命中1词
      mem('b', '用户喜欢咖啡和编程和旅行', '2026-08-01T00:00:00Z'), // 旧但命中3词
    ];
    const ranked = rankMemories(memories, ['咖啡', '编程', '旅行'], now);
    expect(ranked[0].id).toBe('b');
  });

  it('空关键词返回原顺序', () => {
    const memories = [mem('a', 'x', '2026-08-08T11:00:00Z'), mem('b', 'y', '2026-08-08T10:00:00Z')];
    expect(rankMemories(memories, [], now).map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('extractPersonEntities（人物识别）', () => {
  it('识别常见中文人名（姓+名）', () => {
    const memories = [
      mem('a', '用户说喜欢和张三一起工作', '2026-08-08T11:00:00Z'),
      mem('b', '李四昨天来拜访了', '2026-08-08T11:00:00Z'),
    ];
    const persons = extractPersonEntities(memories);
    expect(persons).toContain('张三');
    expect(persons).toContain('李四');
  });

  it('识别外国人名（英文首字母大写词）', () => {
    const memories = [mem('a', 'Alice is a good friend', '2026-08-08T11:00:00Z')];
    const persons = extractPersonEntities(memories);
    expect(persons).toContain('Alice');
  });

  it('普通名词不误报', () => {
    const memories = [mem('a', '用户喜欢咖啡和编程', '2026-08-08T11:00:00Z')];
    expect(extractPersonEntities(memories)).toEqual([]);
  });

  it('去重返回', () => {
    const memories = [
      mem('a', '张三来了', '2026-08-08T11:00:00Z'),
      mem('b', '张三又来了', '2026-08-08T11:30:00Z'),
    ];
    expect(extractPersonEntities(memories)).toEqual(['张三']);
  });
});
