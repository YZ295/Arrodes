import { describe, it, expect, afterAll } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { writeMemoryNotes, renderMemoryNote } from './obsidianMemory.js';
import type { WorkspaceMemory } from '../workspace/memory-hub.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-obsidian-'));

const memories: WorkspaceMemory[] = [
  { id: 'mem-abc123', content: '用户喜欢蓝色主题', sourceAgent: 'arrodes', type: 'preference', createdAt: '2026-08-15T00:00:00.000Z', workspaceId: 'default' },
  { id: 'mem-def456', content: '项目目标是自我更新', sourceAgent: 'hermes', type: 'fact', createdAt: '2026-08-15T00:00:00.000Z', workspaceId: 'default' },
];

describe('obsidianMemory 统一格式导出', () => {
  it('writeMemoryNotes 写入每条记忆与索引（全部导出）', () => {
    const { count, dir } = writeMemoryNotes(tmp, memories);
    expect(count).toBe(2);
    expect(fs.existsSync(path.join(dir, '工作区记忆-mem-abc123.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '00-工作区记忆索引.md'))).toBe(true);
  });

  it('renderMemoryNote 包含 YAML frontmatter 与 wikilink', () => {
    const text = renderMemoryNote(memories[0]);
    expect(text).toContain('title:');
    expect(text).toContain('type: preference');
    expect(text).toContain('[[arrodes]]');
    expect(text).toContain('[[00-工作区记忆索引]]');
  });

  it('索引列出全部记忆', () => {
    const idx = fs.readFileSync(
      path.join(tmp, 'Knowledge', '知识库', 'workspace-memories', '00-工作区记忆索引.md'),
      'utf-8',
    );
    expect(idx).toContain('mem-abc123');
    expect(idx).toContain('mem-def456');
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
