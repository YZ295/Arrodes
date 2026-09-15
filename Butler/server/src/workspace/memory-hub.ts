/**
 * 工作区记忆存储（候选 / 已确认 / 已拒绝）
 *
 * 定位：这是长期记忆的「待审核队列 + 可重建索引」，**不是**最终权威。
 * - 外部智能体（Codex / DSH / WorkBuddy 等）只能写入候选，由阿罗德斯统一审核
 * - 只有 status='confirmed' 的记录才会同步到 Obsidian（长期记忆权威）
 * - 本表随时可清空重建，因此任何模块都不得把它当作唯一真相
 *
 * 统一写入入口为 services/memoryService.ts；本文件只提供存储能力。
 */
import { getDb } from '../db/connection.js';
import { randomUUID } from 'node:crypto';

export type WorkspaceMemoryType = 'fact' | 'preference' | 'decision' | 'event' | 'goal' | 'task' | 'note';

/** 审核状态：候选（待审核）/ 已确认（进入长期记忆）/ 已拒绝（丢弃） */
export type MemoryStatus = 'candidate' | 'confirmed' | 'rejected';

/** 作用域：user=跨项目用户级；project=项目级 */
export type MemoryScope = 'user' | 'project';

export interface WorkspaceMemory {
  id: string;
  content: string;
  sourceAgent: string;
  type: WorkspaceMemoryType;
  createdAt: string;
  workspaceId?: string;
  status?: MemoryStatus;
  scope?: MemoryScope;
  projectId?: string;
  /** 来源标识（agent id / user / skill / screen），新代码统一用这个字段 */
  source?: string;
  /** 证据：出处、屏幕时间点、原话片段等 */
  evidence?: string;
  confidence?: number;
  updatedAt?: string;
}

/** 确保表存在（幂等；含统一记忆结构列） */
export function initWorkspaceMemoriesTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_memories (
      id           TEXT PRIMARY KEY,
      content      TEXT NOT NULL,
      source_agent TEXT NOT NULL DEFAULT 'arrodes',
      type         TEXT NOT NULL DEFAULT 'note',
      workspace_id TEXT NOT NULL DEFAULT 'default',
      status       TEXT NOT NULL DEFAULT 'confirmed',
      scope        TEXT NOT NULL DEFAULT 'project',
      project_id   TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '',
      evidence     TEXT NOT NULL DEFAULT '',
      confidence   REAL NOT NULL DEFAULT 0.8,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_memories_created ON workspace_memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_ws_memories_workspace ON workspace_memories(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_ws_memories_status ON workspace_memories(status);
  `);
}

export interface AddMemoryInput {
  content: string;
  sourceAgent?: string;
  type?: WorkspaceMemoryType;
  workspaceId?: string;
  /** 默认 candidate：外部来源一律先入候选队列，需审核后才进长期记忆 */
  status?: MemoryStatus;
  scope?: MemoryScope;
  projectId?: string;
  source?: string;
  evidence?: string;
  confidence?: number;
}

const SELECT_COLS = `
  id, content, source_agent AS sourceAgent, type, created_at AS createdAt,
  workspace_id AS workspaceId, status, scope, project_id AS projectId,
  source, evidence, confidence, updated_at AS updatedAt
`;

export class WorkspaceMemoryHub {
  /** 写入一条记忆（默认候选，需审核） */
  add(input: AddMemoryInput): WorkspaceMemory {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const now = new Date().toISOString();
    const sourceAgent = input.sourceAgent || input.source || 'arrodes';
    const record: WorkspaceMemory = {
      id: randomUUID(),
      content: input.content.trim(),
      sourceAgent,
      type: input.type || 'note',
      createdAt: now,
      workspaceId: input.workspaceId || 'default',
      status: input.status || 'candidate',
      scope: input.scope || 'project',
      projectId: input.projectId || '',
      source: input.source || sourceAgent,
      evidence: input.evidence || '',
      confidence: typeof input.confidence === 'number' ? input.confidence : 0.8,
      updatedAt: now,
    };
    if (!record.content) throw new Error('内容不能为空');
    if (record.content.length > 2000) throw new Error('内容过长（最大 2000 字）');
    db.prepare(`
      INSERT INTO workspace_memories
        (id, content, source_agent, type, workspace_id, status, scope, project_id, source, evidence, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.content, record.sourceAgent, record.type, record.workspaceId,
      record.status, record.scope, record.projectId, record.source, record.evidence,
      record.confidence, record.createdAt, record.updatedAt,
    );
    return record;
  }

  /**
   * 以指定 id 写入或覆盖（供「从 Obsidian 重建索引」使用）。
   * 不参与常规写入路径——常规写入一律走 add()，id 由系统生成。
   */
  upsert(input: AddMemoryInput & { id: string }): WorkspaceMemory {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const now = new Date().toISOString();
    const sourceAgent = input.sourceAgent || input.source || 'arrodes';
    const content = input.content.trim();
    if (!content) throw new Error('内容不能为空');
    db.prepare(`
      INSERT INTO workspace_memories
        (id, content, source_agent, type, workspace_id, status, scope, project_id, source, evidence, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content    = excluded.content,
        type       = excluded.type,
        status     = excluded.status,
        scope      = excluded.scope,
        source     = excluded.source,
        evidence   = excluded.evidence,
        updated_at = excluded.updated_at
    `).run(
      input.id, content, sourceAgent, input.type || 'note', input.workspaceId || 'default',
      input.status || 'confirmed', input.scope || 'project', input.projectId || '',
      input.source || sourceAgent, input.evidence || '',
      typeof input.confidence === 'number' ? input.confidence : 0.8, now, now,
    );
    const saved = this.get(input.id);
    if (!saved) throw new Error('重建索引失败');
    return saved;
  }

  get(id: string): WorkspaceMemory | null {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM workspace_memories WHERE id = ?`).get(id);
    return (row as WorkspaceMemory) || null;
  }

  /** 变更审核状态（确认 / 拒绝）；返回更新后的记录 */
  setStatus(id: string, status: MemoryStatus): WorkspaceMemory | null {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const info = db.prepare('UPDATE workspace_memories SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id);
    if (info.changes === 0) return null;
    return this.get(id);
  }

  /** 查询记忆（管理视图：不过滤状态，按工作区隔离 + 关键词模糊匹配，时间倒序） */
  search(query?: string, limit = 20, workspaceId = 'default'): WorkspaceMemory[] {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const rows = query?.trim()
      ? db.prepare(`
          SELECT ${SELECT_COLS}
          FROM workspace_memories
          WHERE workspace_id = ? AND content LIKE ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(workspaceId, `%${query.trim()}%`, limit)
      : db.prepare(`
          SELECT ${SELECT_COLS}
          FROM workspace_memories
          WHERE workspace_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(workspaceId, limit);
    return rows as WorkspaceMemory[];
  }

  /**
   * 按状态召回（默认只取已确认）——外部智能体与 LLM 上下文的唯一取数口。
   * 这是「取消全量共享」的落点：未确认的候选不进上下文。
   */
  searchConfirmed(query?: string, limit = 20, workspaceId = 'default'): WorkspaceMemory[] {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const rows = query?.trim()
      ? db.prepare(`
          SELECT ${SELECT_COLS}
          FROM workspace_memories
          WHERE workspace_id = ? AND status = 'confirmed' AND content LIKE ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(workspaceId, `%${query.trim()}%`, limit)
      : db.prepare(`
          SELECT ${SELECT_COLS}
          FROM workspace_memories
          WHERE workspace_id = ? AND status = 'confirmed'
          ORDER BY created_at DESC
          LIMIT ?
        `).all(workspaceId, limit);
    return rows as WorkspaceMemory[];
  }

  /** 待审核候选队列 */
  listPending(workspaceId = 'default'): WorkspaceMemory[] {
    initWorkspaceMemoriesTable();
    const db = getDb();
    return db.prepare(`
      SELECT ${SELECT_COLS}
      FROM workspace_memories
      WHERE workspace_id = ? AND status = 'candidate'
      ORDER BY created_at ASC
    `).all(workspaceId) as WorkspaceMemory[];
  }

  /** 已确认的长期记忆（同步 Obsidian 用） */
  listConfirmed(workspaceId = 'default'): WorkspaceMemory[] {
    initWorkspaceMemoriesTable();
    const db = getDb();
    return db.prepare(`
      SELECT ${SELECT_COLS}
      FROM workspace_memories
      WHERE workspace_id = ? AND status = 'confirmed'
      ORDER BY created_at ASC
    `).all(workspaceId) as WorkspaceMemory[];
  }

  /**
   * 按来源 agent 前缀检索**已确认**记忆（seminar 学习注入用，如 seminar:codex-workbuddy）。
   * 只返回 confirmed —— 候选不得进入任何模型上下文。
   */
  searchBySource(sourcePrefix: string, workspaceId = 'default', limit = 10): WorkspaceMemory[] {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const rows = db.prepare(`
      SELECT ${SELECT_COLS}
      FROM workspace_memories
      WHERE workspace_id = ? AND status = 'confirmed' AND source_agent LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(workspaceId, `${sourcePrefix}%`, limit);
    return rows as WorkspaceMemory[];
  }

  /**
   * 多关键词 OR 召回（仅已确认）；关键词为空时退化为「最近的已确认记忆」。
   * 主对话链路的取数口。
   */
  searchConfirmedByKeywords(keywords: string[], limit = 20, workspaceId = 'default'): WorkspaceMemory[] {
    initWorkspaceMemoriesTable();
    const cleaned = keywords.map((k) => k.trim()).filter(Boolean);
    if (cleaned.length === 0) return this.searchConfirmed(undefined, limit, workspaceId);
    const db = getDb();
    const conditions = cleaned.map(() => 'content LIKE ?').join(' OR ');
    const rows = db.prepare(`
      SELECT ${SELECT_COLS}
      FROM workspace_memories
      WHERE workspace_id = ? AND status = 'confirmed' AND (${conditions})
      ORDER BY created_at DESC
      LIMIT ?
    `).all(workspaceId, ...cleaned.map((k) => `%${k}%`), limit);
    return rows as WorkspaceMemory[];
  }

  /** 列出工作区全部共享记忆（含候选，管理/导出用） */
  listAll(workspaceId = 'default'): WorkspaceMemory[] {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const rows = db.prepare(`
      SELECT ${SELECT_COLS}
      FROM workspace_memories
      WHERE workspace_id = ?
      ORDER BY created_at ASC
    `).all(workspaceId) as WorkspaceMemory[];
    return rows;
  }

  /** 统计（总数 + 按状态 + 按来源 agent，限定工作区） */
  stats(workspaceId = 'default'): {
    total: number;
    byAgent: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    initWorkspaceMemoriesTable();
    const db = getDb();
    const total = (db.prepare('SELECT COUNT(*) AS c FROM workspace_memories WHERE workspace_id = ?').get(workspaceId) as { c: number }).c;
    const rows = db.prepare(`
      SELECT source_agent AS sourceAgent, COUNT(*) AS c FROM workspace_memories
      WHERE workspace_id = ? GROUP BY source_agent
    `).all(workspaceId) as Array<{ sourceAgent: string; c: number }>;
    const byAgent: Record<string, number> = {};
    for (const r of rows) byAgent[r.sourceAgent] = r.c;

    const statusRows = db.prepare(`
      SELECT status, COUNT(*) AS c FROM workspace_memories
      WHERE workspace_id = ? GROUP BY status
    `).all(workspaceId) as Array<{ status: string; c: number }>;
    const byStatus: Record<string, number> = {};
    for (const r of statusRows) byStatus[r.status] = r.c;

    return { total, byAgent, byStatus };
  }
}

export const workspaceMemoryHub = new WorkspaceMemoryHub();
