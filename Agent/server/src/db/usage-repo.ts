/**
 * LLM 用量仓储
 * 记录每次模型调用的 token 消耗，支持按日/月聚合（额度管控数据源）
 */
import { getDb } from './connection.js';

export interface UsageRecord {
  id: number;
  modelId: string;
  sessionId: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated: number;
  createdAt: string;
}

export class UsageRepository {
  /** 写入一条用量记录 */
  create(input: {
    modelId: string;
    sessionId?: string | null;
    promptTokens: number;
    completionTokens: number;
    estimated?: boolean;
  }): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO llm_usage (model_id, session_id, prompt_tokens, completion_tokens, total_tokens, estimated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.modelId,
      input.sessionId ?? null,
      input.promptTokens,
      input.completionTokens,
      input.promptTokens + input.completionTokens,
      input.estimated ? 1 : 0,
      now,
    );
  }

  /** 按日期前缀聚合（'YYYY-MM-DD' 或 'YYYY-MM'） */
  sumTokensByPrefix(prefix: string): number {
    const db = getDb();
    const row = db.prepare(`
      SELECT COALESCE(SUM(total_tokens), 0) AS total
      FROM llm_usage
      WHERE substr(created_at, 1, ?) = ?
    `).get(prefix.length, prefix) as { total: number };
    return row.total;
  }

  /** 今日用量 */
  todayTotal(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.sumTokensByPrefix(today);
  }

  /** 本月用量 */
  monthTotal(): number {
    const month = new Date().toISOString().slice(0, 7);
    return this.sumTokensByPrefix(month);
  }

  /** 最近 N 条记录（调试/展示） */
  recent(limit = 20): UsageRecord[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, model_id AS modelId, session_id AS sessionId,
             prompt_tokens AS promptTokens, completion_tokens AS completionTokens,
             total_tokens AS totalTokens, estimated, created_at AS createdAt
      FROM llm_usage
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as UsageRecord[];
    return rows;
  }
}
