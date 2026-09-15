import { getDb } from './connection.js';
import { randomUUID } from 'node:crypto';

export interface AgentChatMessage {
  id: string;
  workspaceId: string;
  agentId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export class AgentChatRepository {
  append(
    workspaceId: string,
    agentId: string,
    role: 'user' | 'assistant',
    content: string,
  ): AgentChatMessage {
    const db = getDb();
    const msg: AgentChatMessage = {
      id: randomUUID(),
      workspaceId,
      agentId,
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    db.prepare(`
      INSERT INTO workspace_agent_messages (id, workspace_id, agent_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(msg.id, workspaceId, agentId, role, content, msg.createdAt);
    return msg;
  }

  list(workspaceId: string, agentId: string, limit = 50): AgentChatMessage[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, workspace_id AS workspaceId, agent_id AS agentId,
             role, content, created_at AS createdAt
      FROM workspace_agent_messages
      WHERE workspace_id = ? AND agent_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `).all(workspaceId, agentId, limit) as AgentChatMessage[];
    return rows.reverse();
  }
}
