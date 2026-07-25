/**
 * 记忆仓库 (MemoryRepository)
 * 封装 memories 表的 CRUD 操作
 */
import type Database from 'better-sqlite3';
import { getDb } from './connection.js';
import type { MemoryNode, MemoryType } from '../../../shared/types/index.js';
import crypto from 'node:crypto';

interface MemoryRow {
  id: string;
  session_id: string;
  content: string;
  type: string;
  created_at: string;
}

function rowToMemory(row: MemoryRow): MemoryNode {
  return {
    id: row.id,
    content: row.content,
    type: row.type as MemoryType,
    createdAt: row.created_at,
  };
}

export class MemoryRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDb();
  }

  findBySession(sessionId: string): MemoryNode[] {
    const rows = this.db
      .prepare('SELECT * FROM memories WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId) as MemoryRow[];
    return rows.map(rowToMemory);
  }

  create(data: { sessionId: string; content: string; type: MemoryType }): MemoryNode {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO memories (id, session_id, content, type, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, data.sessionId, data.content, data.type, now);

    return { id, content: data.content, type: data.type, createdAt: now };
  }

  deleteBySession(sessionId: string): void {
    this.db.prepare('DELETE FROM memories WHERE session_id = ?').run(sessionId);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  search(query: string): MemoryNode[] {
    // 简单的 LIKE 搜索
    const pattern = `%${query.replace(/[%_]/g, '\\$&')}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM memories WHERE content LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 20`,
      )
      .all(pattern) as MemoryRow[];
    return rows.map(rowToMemory);
  }
}
