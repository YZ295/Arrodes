import { describe, it, expect } from 'vitest';
import type { Message } from '../../../shared/types/index.js';
import { assembleModelMessages } from './modelHistory.js';

function msg(role: 'user' | 'assistant', content: string): Message {
  return { id: content, role, content, timestamp: new Date().toISOString(), isVoice: false };
}

describe('assembleModelMessages 会话投影', () => {
  it('按 画像 → 记忆 → 技能 → 历史 → 当前输入 排序', () => {
    const result = assembleModelMessages({
      profile: '画像',
      memories: [{ id: 'm', content: '喜欢咖啡', type: 'preference', createdAt: '' }],
      skillsPrompt: '技能',
      history: [msg('user', '早上好'), msg('assistant', '早安')],
      userMessage: '现在几点',
    });

    expect(result.map((m) => m.role)).toEqual(['system', 'system', 'system', 'user', 'assistant', 'user']);
    expect(result[0].content).toBe('画像');
    expect(result[1].content).toContain('喜欢咖啡');
    expect(result[2].content).toBe('技能');
    expect(result[5].content).toBe('现在几点');
  });

  it('maxHistory 截断历史', () => {
    const history = [msg('user', '1'), msg('assistant', '2'), msg('user', '3'), msg('assistant', '4')];
    const result = assembleModelMessages({ history, maxHistory: 2 });
    expect(result.map((m) => m.content)).toEqual(['3', '4']);
  });

  it('空画像/记忆/技能不产生空消息', () => {
    const result = assembleModelMessages({ history: [] });
    expect(result).toEqual([]);
  });

  it('将屏幕观察标记为不可信上下文并限制长度，不污染用户消息', () => {
    const result = assembleModelMessages({
      history: [],
      visualContext: `设置窗口\n${'x'.repeat(3000)}`,
      userMessage: '帮我看看这里',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ role: 'system' });
    expect(result[0].content).toContain('不可信');
    expect(result[0].content.length).toBeLessThan(2300);
    expect(result[1]).toEqual({ role: 'user', content: '帮我看看这里' });
  });
});
