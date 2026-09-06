/**
 * 显式记忆指令测试（HoloJarvis 借鉴："记住X"/"忘了X"）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock MemoryRepository（避免真实 DB）
vi.mock('../db/memory-repo.js', () => {
  const mems: Array<{ id: string; sessionId: string; content: string; type: string; createdAt: string }> = [];
  return {
    MemoryRepository: class {
      create(data: { sessionId: string; content: string; type: string }) {
        const node = { id: `m${mems.length + 1}`, ...data, createdAt: new Date().toISOString() };
        mems.push(node);
        return node;
      }
      findAll() { return mems.map((m) => ({ ...m })); }
      delete(id: string) {
        const idx = mems.findIndex((m) => m.id === id);
        if (idx >= 0) { mems.splice(idx, 1); return true; }
        return false;
      }
    },
  };
});

import { handleExplicitMemory } from './explicitMemory.js';

describe('handleExplicitMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('识别"记住X"并写入记忆', () => {
    const r = handleExplicitMemory('s1', '记住我的生日是8月8日');
    expect(r.handled).toBe(true);
    expect(r.reply).toContain('记住了');
    expect(r.reply).toContain('8月8日');
    expect(r.memoryId).toBeDefined();
  });

  it('识别"请记住X"句式', () => {
    const r = handleExplicitMemory('s1', '请记住我喜欢喝拿铁');
    expect(r.handled).toBe(true);
    expect(r.reply).toContain('拿铁');
  });

  it('识别"忘了X"并删除记忆', () => {
    handleExplicitMemory('s1', '记住测试记忆ABC');
    const r = handleExplicitMemory('s1', '忘了测试记忆ABC');
    expect(r.handled).toBe(true);
    expect(r.reply).toContain('已忘记');
    expect(r.reply).toContain('1 条');
  });

  it('"忘了"不存在的记忆给出提示', () => {
    const r = handleExplicitMemory('s1', '忘了不存在的XYZ');
    expect(r.handled).toBe(true);
    expect(r.reply).toContain('没有找到');
  });

  it('普通消息不触发（handled=false）', () => {
    const r = handleExplicitMemory('s1', '你好，今天天气怎么样');
    expect(r.handled).toBe(false);
  });

  it('内容类型推断：偏好/事件/待办', () => {
    const pref = handleExplicitMemory('s1', '记住我喜欢咖啡');
    expect(pref.reply).toContain('偏好');
    const event = handleExplicitMemory('s1', '记住明天下午三点开会');
    expect(event.reply).toContain('事件');
    const task = handleExplicitMemory('s1', '记住需要买牛奶');
    expect(task.reply).toContain('待办');
  });
});
