/**
 * 会话仓库 (SessionRepository)
 * 封装 sessions 表的 CRUD 操作
 */
import type Database from 'better-sqlite3';
import { getDb } from './connection.js';
import type { SessionNode, SessionDetail, SessionTopic } from '../../../shared/types/index.js';
import crypto from 'node:crypto';

interface SessionRow {
  id: string;
  title: string;
  topic: string;
  parent_id: string | null;
  summary: string;
  created_at: string;
  last_active_at: string;
  archived: number;
}

function rowToNode(row: SessionRow, messageCount: number): SessionNode {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic as SessionTopic,
    parentId: row.parent_id,
    messageCount,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
    archived: !!row.archived,
  };
}

export class SessionRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDb();
  }

  findAll(workspaceId?: string, opts: { archived?: boolean } = {}): SessionNode[] {
    const where: string[] = [];
    const params: string[] = [];

    if (workspaceId) {
      where.push('s.workspace_id = ?');
      params.push(workspaceId);
    }
    if (typeof opts.archived === 'boolean') {
      where.push('s.archived = ?');
      params.push(opts.archived ? '1' : '0');
    } else {
      // 默认行为：只返回未归档会话（归档是隐藏语义）
      where.push('s.archived = 0');
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = (this.db
      .prepare(
        `SELECT s.*, (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS msg_count
         FROM sessions s ${whereSql} ORDER BY s.last_active_at DESC`,
      )
      .all(...params) as (SessionRow & { msg_count: number })[]);

    return rows.map((r) => rowToNode(r, r.msg_count));
  }

  findById(id: string): SessionDetail | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as SessionRow | undefined;
    if (!row) return null;

    const messages = this.db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
      .all(id) as SessionDetail['messages'];

    const memories = this.db
      .prepare('SELECT * FROM memories WHERE session_id = ? ORDER BY created_at DESC')
      .all(id) as SessionDetail['keyMemories'];

    return {
      id: row.id,
      title: row.title,
      topic: row.topic as SessionTopic,
      parentId: row.parent_id,
      messageCount: messages.length,
      lastActiveAt: row.last_active_at,
      createdAt: row.created_at,
      summary: row.summary,
      keyMemories: memories.map((m: any) => ({
        id: m.id,
        content: m.content,
        type: m.type,
        createdAt: m.created_at,
      })),
      messages: messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        isVoice: !!m.is_voice,
      })),
    };
  }

  create(data: { title: string; topic: SessionTopic; parentId?: string; initialMessage?: string; workspaceId?: string }): SessionNode {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const workspaceId = data.workspaceId || 'default';

    this.db
      .prepare(
        `INSERT INTO sessions (id, title, topic, parent_id, workspace_id, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, data.title, data.topic, data.parentId || null, workspaceId, now, now);

    // 如果有 initialMessage，写入第一条消息
    if (data.initialMessage) {
      const msgId = crypto.randomUUID();
      this.db
        .prepare(
          `INSERT INTO messages (id, session_id, role, content, timestamp, is_voice)
           VALUES (?, ?, 'user', ?, ?, 0)`,
        )
        .run(msgId, id, data.initialMessage, now);
    }

    return {
      id,
      title: data.title,
      topic: data.topic,
      parentId: data.parentId || null,
      messageCount: data.initialMessage ? 1 : 0,
      lastActiveAt: now,
      createdAt: now,
    };
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /** 归档会话（软删除：列表隐藏，数据保留） */
  archive(id: string): boolean {
    const result = this.db
      .prepare('UPDATE sessions SET archived = 1 WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /** 取消归档 */
  unarchive(id: string): boolean {
    const result = this.db
      .prepare('UPDATE sessions SET archived = 0 WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /**
   * 回收过期会话（自动归档超过 N 天未活跃的会话）
   * @returns 被回收的会话数
   */
  autoArchiveStale(days: number = 30): number {
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const result = this.db
      .prepare(
        `UPDATE sessions SET archived = 1
         WHERE archived = 0 AND last_active_at < ?`,
      )
      .run(cutoff);
    return result.changes;
  }

  updateLastActive(id: string): void {
    this.db
      .prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
  }

  updateSummary(id: string, summary: string): void {
    this.db.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run(summary, id);
  }

  updateTitle(id: string, title: string): SessionNode | null {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE sessions SET title = ?, last_active_at = ? WHERE id = ?')
      .run(title, now, id);
    return this.findAll().find((s) => s.id === id) || null;
  }
}
