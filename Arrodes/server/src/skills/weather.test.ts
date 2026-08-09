/**
 * get_weather 技能测试
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { getAllSkills } from './registry.js';

// 加载 weather 技能（注册）
import './weather.js';

describe('get_weather 技能', () => {
  beforeAll(() => {
    // 阻止真实网络调用（技能内部 fetch 由 mock 兜底，这里只测注册与参数）
  });

  it('技能已注册', () => {
    const skills = getAllSkills();
    expect(skills.some((s) => s.name === 'get_weather')).toBe(true);
  });

  it('技能描述包含触发词', () => {
    const skill = getAllSkills().find((s) => s.name === 'get_weather')!;
    expect(skill.description).toContain('天气');
    expect(skill.args.some((a) => a.name === 'city' && a.required)).toBe(true);
  });

  it('空城市名返回错误提示（不抛异常）', async () => {
    const skill = getAllSkills().find((s) => s.name === 'get_weather')!;
    const result = await skill.execute({ city: '' });
    expect(result).toContain('请提供城市名');
  });

  it('网络失败时返回友好兜底（不抛异常）', async () => {
    // mock fetch 失败
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    try {
      const skill = getAllSkills().find((s) => s.name === 'get_weather')!;
      const result = await skill.execute({ city: '北京' });
      expect(result).toContain('天气查询失败');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
