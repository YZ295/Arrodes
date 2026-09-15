/**
 * Harness 意图路由测试
 * route()：按关键词/意图把消息分发到对应 Agent
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Harness } from './harness.js';

// 测试用轻量 Agent
const fakeAgent = (id: string) => ({
  id,
  name: `${id} Agent`,
  description: 'test',
  temperature: 0.5,
  maxTokens: 100,
  run: async () => ({ reply: `handled by ${id}` }),
});

describe('Harness 意图路由', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = new Harness();
    harness.register(fakeAgent('main'));
    harness.register(fakeAgent('dev'));
    harness.register(fakeAgent('memory'));
  });

  it('普通聊天 → main', () => {
    expect(harness.route('你好，今天天气不错')).toBe('main');
  });

  it('开发意图 → dev（grill-me 触发词）', () => {
    expect(harness.route('帮我 grill-me 一下这个方案')).toBe('dev');
  });

  it('开发意图 → dev（to-spec 触发词）', () => {
    expect(harness.route('把需求转成 spec')).toBe('dev');
  });

  it('开发意图 → dev（implement 触发词）', () => {
    expect(harness.route('按 tickets 实现 T12')).toBe('dev');
  });

  it('开发意图 → dev（code-review 触发词）', () => {
    expect(harness.route('帮我 code review')).toBe('dev');
  });

  it('记忆管理意图 → memory', () => {
    expect(harness.route('查看我的记忆')).toBe('memory');
  });

  it('显式记忆指令不经过路由（由 handler 前置拦截，这里兜底仍回 main）', () => {
    // "记住X" 在 WS handler 层已被 explicitMemory 拦截；route 兜底不误判
    expect(harness.route('记住我的生日是8月8日')).toBe('main');
  });
});
