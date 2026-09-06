/**
 * 工作区记忆 → Obsidian 统一格式导出
 *
 * 统一格式：每条记忆一个 .md 笔记（YAML frontmatter + wikilinks），
 * 全部导出（而非部分），写入记忆库 `Knowledge/知识库/workspace-memories/`。
 *
 * 参考：Obsidian 记忆库约定（title/created/updated/type/tags + ≥2 条 wikilink）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WorkspaceMemory } from '../workspace/memory-hub.js';

export function defaultVaultPath(): string {
  return process.env.OBSIDIAN_VAULT || 'E:\\project\\HermesProject\\Obsidian';
}

export function memoryDir(vaultPath: string): string {
  return resolve(vaultPath, 'Knowledge', '知识库', 'workspace-memories');
}

function slugify(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 12);
}

export function renderMemoryNote(memory: WorkspaceMemory): string {
  const title = `工作区记忆-${slugify(memory.id)}`;
  const now = new Date().toISOString();
  return [
    '---',
    `title: ${title}`,
    `created: ${memory.createdAt}`,
    `updated: ${now}`,
    `type: ${memory.type}`,
    `tags: [workspace-memory, ${memory.sourceAgent}]`,
    `sourceAgent: ${memory.sourceAgent}`,
    `workspaceId: ${memory.workspaceId ?? 'default'}`,
    '---',
    '',
    `# 工作区记忆 · ${memory.sourceAgent}`,
    '',
    memory.content,
    '',
    `- 来源 Agent：[[${memory.sourceAgent}]]`,
    '- 索引：[[00-工作区记忆索引]]',
    '',
  ].join('\n');
}

export function renderMemoryIndex(memories: WorkspaceMemory[]): string {
  const now = new Date().toISOString();
  const lines = memories.map((m) => {
    const title = `工作区记忆-${slugify(m.id)}`;
    const preview = m.content.replace(/\s+/g, ' ').slice(0, 60);
    return `- [[${title}|${title}]] — ${preview}（${m.sourceAgent}）`;
  });
  return [
    '---',
    'title: 00-工作区记忆索引',
    `created: ${now}`,
    `updated: ${now}`,
    'type: index',
    'tags: [workspace-memory, index]',
    '---',
    '',
    '# 工作区记忆索引',
    '',
    '> 由阿罗德斯自动同步（统一格式，全部导出），供所有接入 Agent 共享。',
    '',
    '## 记忆清单',
    '',
    ...(lines.length > 0 ? lines : ['（暂无记忆）']),
    '',
  ].join('\n');
}

/** 把记忆列表写成 Obsidian 笔记（返回写入目录与条数） */
export function writeMemoryNotes(
  vaultPath: string,
  memories: WorkspaceMemory[],
): { count: number; dir: string } {
  const dir = memoryDir(vaultPath);
  mkdirSync(dir, { recursive: true });
  for (const memory of memories) {
    writeFileSync(join(dir, `工作区记忆-${slugify(memory.id)}.md`), renderMemoryNote(memory), 'utf-8');
  }
  writeFileSync(join(dir, '00-工作区记忆索引.md'), renderMemoryIndex(memories), 'utf-8');
  return { count: memories.length, dir };
}

/** 从工作区记忆 Hub 全量同步到 Obsidian */
export function syncWorkspaceMemoriesToObsidian(
  memories: WorkspaceMemory[],
  vaultPath: string = defaultVaultPath(),
): { count: number; dir: string } {
  return writeMemoryNotes(vaultPath, memories);
}
