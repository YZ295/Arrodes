/**
 * 显式记忆指令测试（"记住X" / "忘了X"）
 *
 * 指令现在只经统一记忆入口 memoryService 落库（不再直连 MemoryRepository），
 * 因此测试用真实内存 DB，验证「记住 / 忘记」与长期记忆状态真正一致。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { handleExplicitMemory } from './explicitMemory.js';
import { listConfirmedMemories, recallMemories } from './memoryService.js';

describe('handleExplicitMemory', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  it('识别"记住X"并写入长期记忆', () => {
    const r = handleExplicitMemory('s1', '记住我的生日是8月8日');
    expect(r.handled).toBe(true);
    expect(r.reply).toContain('记住了');
    expect(r.reply).toContain('8月8日');
    expect(r.memoryId).toBeDefined();
    expect(recallMemories('8月8日')).toHaveLength(1);
  });

  it('识别"请记住X"句式', () => {
    const r = handleExplicitMemory('s1', '请记住我喜欢喝拿铁');
    expect(r.handled).toBe(true);
    expect(r.reply).toContain('拿铁');
  });

  it('识别"忘了X"并让记忆退出召回', () => {
    handleExplicitMemory('s1', '记住测试记忆ABC');
    expect(recallMemories('测试记忆ABC')).toHaveLength(1);

    const r = handleExplicitMemory('s1', '忘了测试记忆ABC');
    expect(r.handled).toBe(true);
    expect(r.reply).toContain('已忘记');
    expect(r.reply).toContain('1 条');
    expect(recallMemories('测试记忆ABC')).toHaveLength(0);
    expect(listConfirmedMemories()).toHaveLength(0);
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
