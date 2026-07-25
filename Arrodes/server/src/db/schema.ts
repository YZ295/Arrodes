/**
 * 数据库模式初始化
 * 使用 better-sqlite3 创建表结构
 */
import type Database from 'better-sqlite3';
import { getDb } from './connection.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  topic       TEXT NOT NULL DEFAULT 'other',
  parent_id   TEXT,
  summary     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content     TEXT NOT NULL,
  timestamp   TEXT NOT NULL,
  is_voice    INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

CREATE TABLE IF NOT EXISTS memories (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  content     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'fact' CHECK(type IN ('fact','preference','event','task')),
  created_at  TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memories_session_id ON memories(session_id);
`;

export function initSchema(): void {
  const db = getDb();
  db.exec(SCHEMA_SQL);
}
