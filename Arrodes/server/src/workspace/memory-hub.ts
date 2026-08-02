/**
 * 共享记忆 Hub（Agent 工作区）
 *
 * 工作区级别的跨 agent 共享记忆：任何接入的 agent 都可以写入/查询。
 * 每条记忆标记来源 agent（source_agent），支持按关键词检索。
 *
 * 对应需求："每个被拖进去的 agent 可以共享记忆"。
 */
import { getDb } from '../db/connection.js';
import { randomUUID } from 'node:crypto';

export type WorkspaceMemoryType = 'fact' | 'preference' | 'event' | 'task' | 'note';

export interface WorkspaceMemory {
  id: string;
  content: string;
  sourceAgent: string;
  type: WorkspaceMemoryType;
  createdAt: string;
}

/** 确保表存在（幂等） */
export function initWorkspaceMemoriesTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_memories (
      id           TEXT PRIMARY KEY,
      content      TEXT NOT NULL,
      source_agent TEXT NOT NULL DEFAULT 'arrodes',
      type         TEXT NOT NULL DEFAULT 'note',
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_memories_created ON workspace_memories(created_at);
  `);
}

export class WorkspaceMemoryHub {
  /** 写入一条共享记忆 */
  add(input: { content: string; sourceAgent?: string; type?: WorkspaceMemoryType }): WorkspaceMemory {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const record: WorkspaceMemory = {
      id: randomUUID(),
      content: input.content.trim(),
      sourceAgent: input.sourceAgent || 'arrodes',
      type: input.type || 'note',
      createdAt: new Date().toISOString(),
    };
    if (!record.content) throw new Error('内容不能为空');
    if (record.content.length > 2000) throw new Error('内容过长（最大 2000 字）');
    db.prepare(`
      INSERT INTO workspace_memories (id, content, source_agent, type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(record.id, record.content, record.sourceAgent, record.type, record.createdAt);
    return record;
  }

  /** 查询共享记忆（关键词模糊匹配，按时间倒序） */
  search(query?: string, limit = 20): WorkspaceMemory[] {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const rows = query?.trim()
      ? db.prepare(`
          SELECT id, content, source_agent AS sourceAgent, type, created_at AS createdAt
          FROM workspace_memories
          WHERE content LIKE ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(`%${query.trim()}%`, limit)
      : db.prepare(`
          SELECT id, content, source_agent AS sourceAgent, type, created_at AS createdAt
          FROM workspace_memories
          ORDER BY created_at DESC
          LIMIT ?
        `).all(limit);
    return rows as WorkspaceMemory[];
  }

  /** 统计（按来源 agent） */
  stats(): { total: number; byAgent: Record<string, number> } {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const total = (db.prepare('SELECT COUNT(*) AS c FROM workspace_memories').get() as { c: number }).c;
    const rows = db.prepare('SELECT source_agent AS sourceAgent, COUNT(*) AS c FROM workspace_memories GROUP BY source_agent').all() as Array<{ sourceAgent: string; c: number }>;
    const byAgent: Record<string, number> = {};
    for (const r of rows) byAgent[r.sourceAgent] = r.c;
    return { total, byAgent };
  }
}

export const workspaceMemoryHub = new WorkspaceMemoryHub();
