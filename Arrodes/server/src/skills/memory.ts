/**
 * 记忆管理技能族
 *
 * 覆盖：搜索记忆、查询画像、记忆统计、列出/清理/删除记忆。
 */
import { registerSkill } from './registry.js';
import { MemoryRepository } from '../db/memory-repo.js';
import { loadProfile } from '../services/MemoryGateway.js';

/** 记忆搜索 */
registerSkill({
  name: 'search_memory',
  description: '搜索历史记忆。当用户问"还记得之前说过什么""之前讨论过什么""有什么记忆"时使用。',
  args: [
    { name: 'query', type: 'string', required: true, description: '搜索关键词' },
  ],
  execute: async (args) => {
    const query = String(args.query || '');
    const repo = new MemoryRepository();
    const results = repo.searchAll(query.split(/\s+/));
    if (results.length === 0) return '未找到相关记忆';
    return results.slice(0, 5).map((m) => `- [${m.type}] ${m.content}`).join('\n');
  },
});

/** 用户画像查询 */
registerSkill({
  name: 'get_profile',
  description: '查询用户画像。当用户问"你知道我什么""你了解我多少""我的偏好"时使用。',
  args: [],
  execute: async () => {
    const profile = loadProfile();
    const parts: string[] = [];
    if (Object.keys(profile.facts).length > 0) {
      parts.push('已知信息:', ...Object.entries(profile.facts).map(([k, v]) => `  ${k}: ${v}`));
    }
    if (profile.preferences.length > 0) parts.push('偏好: ' + profile.preferences.join(', '));
    if (profile.interests.length > 0) parts.push('兴趣: ' + profile.interests.join(', '));
    if (profile.tasks.length > 0) parts.push('待办: ' + profile.tasks.join(', '));
    if (parts.length === 0) return '还没有积累用户画像信息，多聊几次后会自动建立。';
    parts.push(`\n对话次数: ${profile.conversationCount}`);
    return parts.join('\n');
  },
});

/** 记忆统计 */
registerSkill({
  name: 'memory_stats',
  description: '查看记忆统计信息。当用户问"有多少记忆""记忆概况""我的记忆数据"时使用。',
  args: [],
  execute: async () => {
    const repo = new MemoryRepository();
    const all = repo.findAll();
    if (all.length === 0) return '目前还没有存储任何记忆。';

    const byType: Record<string, number> = {};
    const sessions = new Set<string>();
    for (const m of all) {
      byType[m.type] = (byType[m.type] || 0) + 1;
      sessions.add(m.sessionId);
    }

    const typeNames: Record<string, string> = { fact: '事实', preference: '偏好', event: '事件', task: '任务' };
    const lines = [`共 ${all.length} 条记忆，分布在 ${sessions.size} 个会话中：`];
    for (const [type, count] of Object.entries(byType)) {
      lines.push(`  ${typeNames[type] || type}: ${count} 条`);
    }
    return lines.join('\n');
  },
});

/** 列出全部记忆 */
registerSkill({
  name: 'memory_list_all',
  description: '列出所有记忆。当用户说"显示所有记忆""列出记忆""查看记忆"时使用。',
  args: [],
  execute: async () => {
    const repo = new MemoryRepository();
    const all = repo.findAll();
    if (all.length === 0) return '目前还没有存储任何记忆。';
    return all.slice(0, 20).map((m, i) => `${i + 1}. [${m.type}] ${m.content}`).join('\n')
      + (all.length > 20 ? `\n... 还有 ${all.length - 20} 条` : '');
  },
});

/** 清理记忆 */
registerSkill({
  name: 'memory_cleanup',
  description: '清理/删除记忆。当用户说"清理记忆""删除记忆""忘记xxx""清除记忆"时使用。',
  args: [
    { name: 'query', type: 'string', required: false, description: '要删除的记忆关键词，不填则清理 30 天前的旧记忆' },
  ],
  execute: async (args) => {
    const repo = new MemoryRepository();
    if (args.query) {
      const matched = repo.searchAll([String(args.query)]);
      if (matched.length === 0) return `未找到包含"${args.query}"的记忆。`;
      for (const m of matched) repo.delete(m.id);
      return `已删除 ${matched.length} 条包含"${args.query}"的记忆。`;
    }
    const all = repo.findAll();
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const old = all.filter((m) => new Date(m.createdAt).getTime() < cutoff);
    if (old.length === 0) return '没有 30 天前的旧记忆需要清理。';
    for (const m of old) repo.delete(m.id);
    return `已清理 ${old.length} 条 30 天前的旧记忆。`;
  },
});

/** 删除指定记忆 */
registerSkill({
  name: 'delete_memory',
  description: '删除指定记忆。当用户说"删除第N条记忆""删掉XXX记忆"时使用。',
  args: [
    { name: 'target', type: 'string', required: true, description: '要删除的记忆编号或关键词' },
  ],
  execute: async (args) => {
    const repo = new MemoryRepository();
    const all = repo.findAll();
    const target = String(args.target || '');

    const num = parseInt(target);
    if (!isNaN(num) && num > 0 && num <= all.length) {
      const m = all[num - 1];
      repo.delete(m.id);
      return `已删除: [${m.type}] ${m.content}`;
    }

    const matched = repo.searchAll(target.split(/\s+/));
    if (matched.length === 0) return `未找到包含"${target}"的记忆。`;
    if (matched.length === 1) {
      repo.delete(matched[0].id);
      return `已删除: [${matched[0].type}] ${matched[0].content}`;
    }
    return `找到 ${matched.length} 条匹配"${target}"的记忆，请使用 memory_cleanup 并指定 query="${target}" 来批量删除。`;
  },
});
