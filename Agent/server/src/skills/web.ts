/**
 * 联网检索技能（治"无根之知"）
 *
 * 阿罗德斯自我剖析短板①：知识无根，容易凭空作答。
 * 此技能让阿罗德斯在不确定/时效性问题时，先联网核实再回答。
 *
 * 使用 Bing 网页搜索（国内可直接访问，无需 API Key）。
 */
import { registerSkill } from './registry.js';

/** 抓取 Bing 搜索结果标题+链接 */
async function bingSearch(query: string): Promise<string> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-hans`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`搜索服务响应 ${res.status}`);

  const html = await res.text();
  // Bing 结果结构: <h2><a href="URL">标题</a></h2>
  const results: string[] = [];
  const re = /<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/g;
  const matches = [...html.matchAll(re)].slice(0, 5);

  for (let i = 0; i < matches.length; i++) {
    const href = matches[i][1] || '';
    const title = matches[i][2]?.replace(/<[^>]+>/g, '').trim() || '';
    if (title) results.push(`${i + 1}. ${title}\n   ${href}`);
  }

  return results.length > 0
    ? results.join('\n\n')
    : '未检索到结果，请尝试更换关键词。';
}

registerSkill({
  name: 'web_search',
  description: '联网搜索最新信息（Bing 中文检索）。当用户询问时效性问题（新闻、天气、政策、产品价格、比赛结果等）、或你对答案不确定需要核实事实时使用。返回搜索结果标题+链接。',
  args: [
    { name: 'query', type: 'string', required: true, description: '搜索关键词（中文即可）' },
  ],
  execute: async (args) => {
    const query = String(args.query || '').trim();
    if (!query) return '错误: 搜索关键词不能为空';
    try {
      return await bingSearch(query);
    } catch (err) {
      return `联网检索失败: ${err instanceof Error ? err.message : '网络异常'}\n（阿罗德斯未能核实此信息，请谨慎采纳）`;
    }
  },
});

/** 网页正文抓取（治"无根之知"的第二层：读原文） */
async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`页面响应 ${res.status}`);
  const html = await res.text();
  // 去除 script/style/标签，提取纯文本
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, 3000);
}

registerSkill({
  name: 'web_fetch',
  description: '读取指定网页的正文内容。当用户给了一个链接想了解内容、或 web_search 的结果需要深入阅读时使用。返回网页纯文本（截取前 3000 字符）。',
  args: [
    { name: 'url', type: 'string', required: true, description: '网页完整 URL' },
  ],
  execute: async (args) => {
    const url = String(args.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return '错误: 请输入以 http:// 或 https:// 开头的完整 URL';
    try {
      return await fetchPageText(url);
    } catch (err) {
      return `页面抓取失败: ${err instanceof Error ? err.message : '网络异常'}`;
    }
  },
});
