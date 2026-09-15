import { config } from '../config.js';
/**
 * 知识点存取技能（桌宠学习辅助）
 *
 * 用户说「保存知识点：<名称>：<内容>」→ knowledge_save 累积保存（同名覆盖更新）。
 * 用户问某个概念 → knowledge_query 检索已存内容，LLM 用大白话解释。
 * 持久化：data/knowledge.json（与 reminders.json 同款轻量方案，无 migration 负担）。
 */
import { registerSkill } from './registry.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KNOWLEDGE_FILE = resolve(config.dbPath, 'knowledge.json');

interface KnowledgePoint {
  name: string;
  content: string;
  savedAt: number;
}

function loadKnowledge(): KnowledgePoint[] {
  try {
    if (!existsSync(KNOWLEDGE_FILE)) return [];
    return JSON.parse(readFileSync(KNOWLEDGE_FILE, 'utf-8')) as KnowledgePoint[];
  } catch {
    return [];
  }
}

function saveKnowledge(list: KnowledgePoint[]): void {
  mkdirSync(dirname(KNOWLEDGE_FILE), { recursive: true });
  writeFileSync(KNOWLEDGE_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

registerSkill({
  name: 'knowledge_save',
  description: '保存/更新一个知识点。当用户说"保存知识点""记一下这个知识点""学这个"时使用。同名知识点会被覆盖更新。',
  args: [
    { name: 'name', type: 'string', required: true, description: '知识点名称（简短，如「TCP三次握手」）' },
    { name: 'content', type: 'string', required: true, description: '知识点内容（用户原话或提炼，保持完整）' },
  ],
  execute: async (args) => {
    const name = String(args.name || '').trim();
    const content = String(args.content || '').trim();
    if (!name || !content) return '错误: 名称和内容都不能为空';
    const list = loadKnowledge();
    const existing = list.findIndex((k) => k.name === name);
    if (existing >= 0) {
      list[existing] = { name, content, savedAt: Date.now() };
      saveKnowledge(list);
      return `已更新知识点「${name}」（共 ${list.length} 个）`;
    }
    list.push({ name, content, savedAt: Date.now() });
    saveKnowledge(list);
    return `已保存知识点「${name}」（共 ${list.length} 个）`;
  },
});

registerSkill({
  name: 'knowledge_query',
  description: '查询已保存的知识点。当用户问某个概念/知识点，或问"我存过哪些知识点"时使用。支持名称精确匹配与内容模糊匹配。',
  args: [
    { name: 'keyword', type: 'string', required: false, description: '关键词（留空 = 列出全部已存知识点名称）' },
  ],
  execute: async (args) => {
    const keyword = String(args.keyword || '').trim();
    const list = loadKnowledge();
    if (list.length === 0) return '还没有保存任何知识点。';
    if (!keyword) {
      return `已存 ${list.length} 个知识点：\n` + list.map((k) => `- ${k.name}`).join('\n');
    }
    const exact = list.find((k) => k.name === keyword);
    if (exact) return `【${exact.name}】\n${exact.content}`;
    const fuzzy = list.filter((k) => k.name.includes(keyword) || k.content.includes(keyword));
    if (fuzzy.length === 0) return `没有找到与「${keyword}」相关的知识点。`;
    return fuzzy.map((k) => `【${k.name}】\n${k.content}`).join('\n---\n');
  },
});

registerSkill({
  name: 'knowledge_delete',
  description: '删除一个已保存的知识点。当用户说"删掉/忘记某个知识点"时使用。',
  args: [
    { name: 'name', type: 'string', required: true, description: '要删除的知识点名称' },
  ],
  execute: async (args) => {
    const name = String(args.name || '').trim();
    const list = loadKnowledge();
    const next = list.filter((k) => k.name !== name);
    if (next.length === list.length) return `没有名为「${name}」的知识点。`;
    saveKnowledge(next);
    return `已删除知识点「${name}」（剩 ${next.length} 个）`;
  },
});
