import { registerSkill } from './registry.js';
import { runWinOp } from '../services/winops.js';

const SITE_RULES: Record<string, (query: string) => string> = {
  bilibili: (q) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`,
  zhihu: (q) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(q)}`,
  baidu: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  github: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`,
  npm: (q) => `https://www.npmjs.com/search?q=${encodeURIComponent(q)}`,
  taobao: (q) => `https://s.taobao.com/search?q=${encodeURIComponent(q)}`,
  jd: (q) => `https://search.jd.com/Search?keyword=${encodeURIComponent(q)}`,
  douban: (q) => `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(q)}`,
  weibo: (q) => `https://s.weibo.com/weibo?q=${encodeURIComponent(q)}`,
  music163: (q) => `https://music.163.com/#/search/m/?s=${encodeURIComponent(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
};

const SITE_ALIASES: Record<string, string> = {
  bilibili: 'bilibili',
  b站: 'bilibili',
  哔哩哔哩: 'bilibili',
  zhihu: 'zhihu',
  知乎: 'zhihu',
  baidu: 'baidu',
  百度: 'baidu',
  bing: 'bing',
  必应: 'bing',
  google: 'google',
  github: 'github',
  npm: 'npm',
  taobao: 'taobao',
  淘宝: 'taobao',
  jd: 'jd',
  京东: 'jd',
  douban: 'douban',
  豆瓣: 'douban',
  weibo: 'weibo',
  微博: 'weibo',
  music163: 'music163',
  网易云: 'music163',
  youtube: 'youtube',
};

export function resolveSite(site: string): string | null {
  return SITE_ALIASES[site.trim().toLowerCase()] ?? null;
}

export function buildSearchUrl(site: string, query: string): string {
  const key = resolveSite(site) ?? 'baidu';
  const builder = SITE_RULES[key] ?? SITE_RULES.baidu;
  return builder(query.trim());
}

export function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

registerSkill({
  name: 'open_url',
  description: '用默认浏览器打开网址。当用户说"打开网页""打开网址""去这个链接"时使用。',
  args: [
    { name: 'url', type: 'string', required: true, description: '完整 URL（http/https）' },
  ],
  execute: async (args) => {
    const url = String(args.url || '').trim();
    if (!isSafeUrl(url)) return `错误: 仅支持 http/https 网址（收到: ${url.slice(0, 50)}）`;
    const result = await runWinOp('open-app', url);
    return result.ok ? `已在默认浏览器打开: ${url}` : `打开失败: ${result.error || '未知错误'}`;
  },
});

registerSkill({
  name: 'web_search_direct',
  description: '站内搜索直达。当用户说"在B站搜XX""知乎搜XX""百度一下XX"时使用，直接打开对应站点搜索结果页。',
  args: [
    { name: 'site', type: 'string', required: true, description: '站点（bilibili/b站/知乎/百度/必应/google/github/npm/淘宝/京东/豆瓣/微博/网易云/youtube）' },
    { name: 'query', type: 'string', required: true, description: '搜索关键词' },
  ],
  execute: async (args) => {
    const site = String(args.site || '');
    const query = String(args.query || '').trim();
    if (!query) return '错误: 搜索关键词不能为空';
    const url = buildSearchUrl(site, query);
    const result = await runWinOp('open-app', url);
    const siteName = resolveSite(site) ?? '默认';
    return result.ok ? `已打开${siteName}搜索: ${query}` : `打开失败: ${result.error || '未知错误'}`;
  },
});

registerSkill({
  name: 'web_search',
  description: '通用网页搜索。当用户说"搜一下XX""查查XX"时使用，用默认搜索引擎打开结果页。',
  args: [
    { name: 'query', type: 'string', required: true, description: '搜索关键词' },
  ],
  execute: async (args) => {
    const query = String(args.query || '').trim();
    if (!query) return '错误: 搜索关键词不能为空';
    const url = buildSearchUrl('baidu', query);
    const result = await runWinOp('open-app', url);
    return result.ok ? `已打开百度搜索: ${query}` : `打开失败: ${result.error || '未知错误'}`;
  },
});
