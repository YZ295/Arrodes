/**
 * 工作区路由（Agent 工作区 · 兼容层）
 *
 * GET  /api/v1/workspace            → 连接器列表 + 共享记忆概览（?ws= 指定工作区）
 * GET  /api/v1/workspace/memories   → 查询共享记忆（?ws= 指定工作区）
 * POST /api/v1/workspace/memories   → 写入共享记忆（body.workspaceId 可选）
 *
 * workspace-v2：新 CRUD 走 /api/v1/workspaces（复数），本路由保留向后兼容。
 */
import { Router } from 'express';
import { detectConnectors } from '../workspace/connectors.js';
import { workspaceMemoryHub } from '../workspace/memory-hub.js';
import { workspaceRepo } from '../db/workspace-repo.js';
import { syncWorkspaceMemoriesToObsidian } from '../services/obsidianMemory.js';

export function createWorkspaceRouter(): Router {
  const router = Router();

  // 工作区总览（?ws= 指定工作区，默认 default）
  router.get('/', async (req, res) => {
    try {
      const ws = typeof req.query.ws === 'string' && req.query.ws ? String(req.query.ws) : 'default';
      const agents = await detectConnectors();
      const connected = workspaceRepo.listMembers(ws)
        .filter((m) => m.memberType === 'agent')
        .map((m) => m.memberId);
      const stats = workspaceMemoryHub.stats(ws);
      const recent = workspaceMemoryHub.search(undefined, 10, ws);
      res.json({ agents, connected, memories: { stats, recent } });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '工作区查询失败' });
    }
  });

  // 共享记忆查询
  router.get('/memories', (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
      res.json({ memories: workspaceMemoryHub.search(q, limit) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  // 写入共享记忆
  router.post('/memories', (req, res) => {
    try {
      const { content, type, sourceAgent } = req.body ?? {};
      const record = workspaceMemoryHub.add({
        content: String(content ?? ''),
        type,
        sourceAgent: sourceAgent ? String(sourceAgent) : undefined,
      });
      res.status(201).json({ memory: record });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '写入失败' });
    }
  });

  // 全量同步工作区记忆到 Obsidian（统一格式，全部而非部分）
  router.post('/memories/sync-obsidian', (req, res) => {
    try {
      const workspaceId = typeof req.body?.workspaceId === 'string' && req.body.workspaceId
        ? req.body.workspaceId
        : 'default';
      const memories = workspaceMemoryHub.listAll(workspaceId);
      const result = syncWorkspaceMemoriesToObsidian(memories);
      res.json({ ok: true, count: result.count, dir: result.dir });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '同步失败' });
    }
  });

  return router;
}
