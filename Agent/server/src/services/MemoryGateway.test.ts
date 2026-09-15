/**
 * MemoryGateway 纯函数测试
 * parseAnalysisJson：从 LLM 文本提取记忆分析 JSON（含边界）
 */
import { describe, it, expect } from 'vitest';
import { parseAnalysisJson } from './MemoryGateway.js';

describe('parseAnalysisJson', () => {
  it('解析纯 JSON 文本', () => {
    const text = '{"memories":[{"content":"用户喜欢咖啡","type":"preference"}],"profile":{"preferences":["咖啡"]}}';
    const result = parseAnalysisJson(text);
    expect(result?.memories?.[0].content).toBe('用户喜欢咖啡');
    expect(result?.profile?.preferences).toEqual(['咖啡']);
  });

  it('从夹带解释文字中提取 JSON 块', () => {
    const text = '好的，我来分析：\n{"memories":[],"profile":{}}\n以上就是分析结果。';
    const result = parseAnalysisJson(text);
    expect(result).toEqual({ memories: [], profile: {} });
  });

  it('空文本返回 null', () => {
    expect(parseAnalysisJson('')).toBeNull();
  });

  it('无 JSON 的文本返回 null', () => {
    expect(parseAnalysisJson('没有任何JSON内容')).toBeNull();
  });

  it('JSON 损坏返回 null（不抛异常）', () => {
    expect(parseAnalysisJson('{"memories": [broken}')).toBeNull();
  });

  it('解析完整画像结构', () => {
    const text = JSON.stringify({
      memories: [
        { content: '用户是程序员', type: 'fact' },
        { content: '明天开会', type: 'event' },
      ],
      profile: {
        facts: { 职业: '程序员' },
        preferences: ['咖啡'],
        interests: ['科幻'],
        events: [{ description: '明天开会' }],
        tasks: ['查邮件'],
      },
    });
    const result = parseAnalysisJson(text);
    expect(result?.memories).toHaveLength(2);
    expect(result?.profile?.facts).toEqual({ 职业: '程序员' });
    expect(result?.profile?.tasks).toEqual(['查邮件']);
  });
});
