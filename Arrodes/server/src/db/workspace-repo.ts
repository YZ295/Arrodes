/**
 * 工作区仓库（workspace-v2）
 *
 * workspaces CRUD + 成员管理。
 * 迁移：存量数据归入「默认工作区」（见 db/schema.ts ensureWorkspaceColumns）。
 */
import { getDb } from './connection.js';
import { randomUUID } from 'node:crypto';

export interface Workspace {
  id: string;
  name: string;
  kind: string;
  icon: string;
  config: Record<string, unknown>;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  memberType: 'user' | 'agent';
  memberId: string;
  role: 'owner' | 'admin' | 'member' | 'guest';
  joinedAt: string;
}

interface Row {
  id: string; name: string; kind: string; icon: string;
  config_json: string; status: string; created_at: string; updated_at: string;
}

function toWorkspace(r: Row): Workspace {
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(r.config_json || '{}'); } catch { /* 忽略坏 JSON */ }
  return {
    id: r.id, name: r.name, kind: r.kind, icon: r.icon,
    config, status: r.status as Workspace['status'],
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export class WorkspaceRepository {
  list(): Workspace[] {
    const db = getDb();
    const rows = db.prepare(
      'SELECT * FROM workspaces ORDER BY status ASC, updated_at DESC'
    ).all() as Row[];
    return rows.map(toWorkspace);
  }

  get(id: string): Workspace | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Row | undefined;
    return row ? toWorkspace(row) : null;
  }

  create(input: { name: string; kind?: string; icon?: string }): Workspace {
    const db = getDb();
    const now = new Date().toISOString();
    const id = randomUUID();
    const ws: Workspace = {
      id, name: input.name.trim(), kind: input.kind || 'default',
      icon: input.icon || '🪐', config: {}, status: 'active',
      createdAt: now, updatedAt: now,
    };
    if (!ws.name) throw new Error('工作区名称不能为空');
    db.transaction(() => {
      db.prepare(`
        INSERT INTO workspaces (id, name, kind, icon, config_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, '{}', 'active', ?, ?)
      `).run(ws.id, ws.name, ws.kind, ws.icon, now, now);
      db.prepare(`
        INSERT INTO workspace_members (workspace_id, member_type, member_id, role, joined_at)
        VALUES (?, 'user', 'local-user', 'owner', ?)
      `).run(ws.id, now);
    })();
    return ws;
  }

  update(id: string, patch: { name?: string; icon?: string; status?: 'active' | 'archived'; config?: Record<string, unknown> }): Workspace | null {
    const db = getDb();
    const cur = this.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE workspaces
      SET name = ?, icon = ?, status = ?, config_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      patch.name ?? cur.name,
      patch.icon ?? cur.icon,
      patch.status ?? cur.status,
      JSON.stringify(patch.config ?? cur.config),
      now, id,
    );
    return this.get(id);
  }

  /** 归档（软删除，不物理删数据） */
  archive(id: string): Workspace | null {
    return this.update(id, { status: 'archived' });
  }

  /** 统计某工作区的会话/记忆数量（面板概览用） */
  stats(id: string): { sessions: number; memories: number; wsMemories: number } {
    const db = getDb();
    const s = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE workspace_id = ?').get(id) as { c: number };
    const m = db.prepare('SELECT COUNT(*) AS c FROM memories WHERE workspace_id = ?').get(id) as { c: number };
    const w = db.prepare('SELECT COUNT(*) AS c FROM workspace_memories WHERE workspace_id = ?').get(id) as { c: number };
    return { sessions: s.c, memories: m.c, wsMemories: w.c };
  }
}

export const workspaceRepo = new WorkspaceRepository();
