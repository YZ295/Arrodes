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

CREATE TABLE IF NOT EXISTS llm_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id      TEXT NOT NULL,
  session_id    TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens  INTEGER NOT NULL DEFAULT 0,
  estimated     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created_at ON llm_usage(created_at);

-- workspace-v2: 多智能体协作工作区
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'default',
  icon        TEXT NOT NULL DEFAULT '🪐',
  config_json TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  member_type  TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (workspace_id, member_type, member_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
`;

/** 幂等迁移：为存量表补充 workspace_id 列（workspace-v2） */
function ensureWorkspaceColumns(): void {
  const db = getDb();

  // workspace_memories 由 memory-hub 懒创建，此处先行确保存在以便迁移加列
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_memories (
      id           TEXT PRIMARY KEY,
      content      TEXT NOT NULL,
      source_agent TEXT NOT NULL DEFAULT 'arrodes',
      type         TEXT NOT NULL DEFAULT 'note',
      workspace_id TEXT NOT NULL DEFAULT 'default',
      created_at   TEXT NOT NULL
    );
  `);

  // 创建「默认工作区」，保证外键/查询一致性
  const def = db.prepare('SELECT COUNT(*) AS c FROM workspaces WHERE id = ?').get('default') as { c: number };
  if (def.c === 0) {
    db.prepare(`
      INSERT INTO workspaces (id, name, kind, icon, config_json, status, created_at, updated_at)
      VALUES ('default', '默认工作区', 'default', '🪐', '{}', 'active', ?, ?)
    `).run(new Date().toISOString(), new Date().toISOString());
    db.prepare(`
      INSERT INTO workspace_members (workspace_id, member_type, member_id, role, joined_at)
      VALUES ('default', 'user', 'local-user', 'owner', ?)
    `).run(new Date().toISOString());
  }

  // 检查并补充列（PRAGMA table_info 幂等）
  const targets: Array<{ table: string; col: string }> = [
    { table: 'sessions', col: 'workspace_id' },
    { table: 'sessions', col: 'archived' },
    { table: 'memories', col: 'workspace_id' },
    { table: 'workspace_memories', col: 'workspace_id' },
  ];
  for (const { table, col } of targets) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col)) {
      // archived 用 INTEGER 布尔（0/1），默认 0
      const ddl = col === 'archived'
        ? `ALTER TABLE ${table} ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`
        : `ALTER TABLE ${table} ADD COLUMN ${col} TEXT NOT NULL DEFAULT 'default'`;
      db.prepare(ddl).run();
      console.log(`[Schema] 已迁移: ${table}.${col}`);
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_ws_memories_workspace ON workspace_memories(workspace_id);
  `);
}

export function initSchema(): void {
  const db = getDb();
  db.exec(SCHEMA_SQL);
  ensureWorkspaceColumns();
}
