import { describe, it, expect } from 'vitest';
import { buildSearchUrl, resolveSite, isSafeUrl } from './browser.js';

describe('browser 站内搜索直达', () => {
  it('B站直达搜索', () => {
    expect(buildSearchUrl('bilibili', '阿罗德斯')).toBe(
      `https://search.bilibili.com/all?keyword=${encodeURIComponent('阿罗德斯')}`,
    );
  });

  it('知乎直达', () => {
    expect(buildSearchUrl('zhihu', 'MCP')).toBe('https://www.zhihu.com/search?type=content&q=MCP');
  });

  it('别名归一化（b站/知乎）', () => {
    expect(resolveSite('b站')).toBe('bilibili');
    expect(resolveSite('B站')).toBe('bilibili');
    expect(resolveSite('知乎')).toBe('zhihu');
  });

  it('未知站点回退默认搜索引擎', () => {
    expect(buildSearchUrl('不存在的站', 'x')).toContain('baidu.com');
  });

  it('仅允许 http/https URL', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com/a?b=1')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('not a url')).toBe(false);
  });
});
