/**
 * 研讨会仓库（多 Agent 互相对话学习）
 *
 * workspace_seminars：会话元数据（主题/双方/轮数/状态/学习小结）
 * workspace_seminar_messages：逐轮对话记录（speaker = agent id）
 *
 * 学习小结（summary）由阿罗德斯在研讨会结束后提炼，同时写入共享记忆。
 */
import { getDb } from './connection.js';
import { randomUUID } from 'node:crypto';

export type SeminarStatus = 'running' | 'done' | 'failed';

export interface Seminar {
  id: string;
  workspaceId: string;
  topic: string;
  agentA: string;
  agentB: string;
  rounds: number;
  status: SeminarStatus;
  summary: string;
  error: string;
  createdAt: string;
  completedAt: string | null;
}

export interface SeminarMessage {
  id: string;
  seminarId: string;
  speaker: string;
  content: string;
  createdAt: string;
}

interface SeminarRow {
  id: string;
  workspace_id: string;
  topic: string;
  agent_a: string;
  agent_b: string;
  rounds: number;
  status: SeminarStatus;
  summary: string;
  error: string;
  created_at: string;
  completed_at: string | null;
}

function toSeminar(r: SeminarRow): Seminar {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    topic: r.topic,
    agentA: r.agent_a,
    agentB: r.agent_b,
    rounds: r.rounds,
    status: r.status,
    summary: r.summary,
    error: r.error,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export class SeminarRepository {
  create(input: {
    workspaceId: string;
    topic: string;
    agentA: string;
    agentB: string;
    rounds: number;
  }): Seminar {
    const db = getDb();
    const now = new Date().toISOString();
    const seminar: Seminar = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      topic: input.topic,
      agentA: input.agentA,
      agentB: input.agentB,
      rounds: input.rounds,
      status: 'running',
      summary: '',
      error: '',
      createdAt: now,
      completedAt: null,
    };
    db.prepare(`
      INSERT INTO workspace_seminars
        (id, workspace_id, topic, agent_a, agent_b, rounds, status, summary, error, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, 'running', '', '', ?, NULL)
    `).run(
      seminar.id, seminar.workspaceId, seminar.topic,
      seminar.agentA, seminar.agentB, seminar.rounds, seminar.createdAt,
    );
    return seminar;
  }

  get(id: string): Seminar | null {
    const db = getDb();
    const row = db.prepare(`
      SELECT id, workspace_id, topic, agent_a, agent_b, rounds, status, summary, error,
             created_at, completed_at
      FROM workspace_seminars WHERE id = ?
    `).get(id) as SeminarRow | undefined;
    return row ? toSeminar(row) : null;
  }

  list(workspaceId: string, limit = 20): Seminar[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, workspace_id, topic, agent_a, agent_b, rounds, status, summary, error,
             created_at, completed_at
      FROM workspace_seminars
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(workspaceId, limit) as SeminarRow[];
    return rows.map(toSeminar);
  }

  appendMessage(seminarId: string, speaker: string, content: string): SeminarMessage {
    const db = getDb();
    const msg: SeminarMessage = {
      id: randomUUID(),
      seminarId,
      speaker,
      content,
      createdAt: new Date().toISOString(),
    };
    db.prepare(`
      INSERT INTO workspace_seminar_messages (id, seminar_id, speaker, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(msg.id, seminarId, speaker, content, msg.createdAt);
    return msg;
  }

  messages(seminarId: string): SeminarMessage[] {
    const db = getDb();
    return db.prepare(`
      SELECT id, seminar_id AS seminarId, speaker, content, created_at AS createdAt
      FROM workspace_seminar_messages
      WHERE seminar_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(seminarId) as SeminarMessage[];
  }

  finish(id: string, input: { status: SeminarStatus; summary?: string; error?: string }): Seminar | null {
    const db = getDb();
    db.prepare(`
      UPDATE workspace_seminars
      SET status = ?, summary = ?, error = ?, completed_at = ?
      WHERE id = ?
    `).run(
      input.status,
      input.summary ?? '',
      input.error ?? '',
      input.status === 'running' ? null : new Date().toISOString(),
      id,
    );
    return this.get(id);
  }
}

export const seminarRepo = new SeminarRepository();
