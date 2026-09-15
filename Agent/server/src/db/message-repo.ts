/**
 * 消息仓库 (MessageRepository)
 * 封装 messages 表的 CRUD 操作
 */
import type Database from 'better-sqlite3';
import { getDb } from './connection.js';
import type { Message } from '../../../shared/types/index.js';
import crypto from 'node:crypto';

interface MessageRow {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  is_voice: number;
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    isVoice: !!row.is_voice,
  };
}

export class MessageRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDb();
  }

  findBySession(sessionId: string): Message[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC')
      .all(sessionId) as MessageRow[];
    return rows.map(rowToMessage);
  }

  create(data: { sessionId: string; role: 'user' | 'assistant'; content: string; isVoice: boolean }): Message {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, timestamp, is_voice)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, data.sessionId, data.role, data.content, now, data.isVoice ? 1 : 0);

    return { id, role: data.role, content: data.content, timestamp: now, isVoice: data.isVoice };
  }

  deleteBySession(sessionId: string): void {
    this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  }
}
