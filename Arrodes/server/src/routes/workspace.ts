/**
 * 工作区路由（Agent 工作区）
 *
 * GET  /api/v1/workspace            → 连接器列表 + 共享记忆概览
 * GET  /api/v1/workspace/memories   → 查询共享记忆（?q= 关键词）
 * POST /api/v1/workspace/memories   → 写入共享记忆
 */
import { Router } from 'express';
import { detectConnectors } from '../workspace/connectors.js';
import { workspaceMemoryHub } from '../workspace/memory-hub.js';

export function createWorkspaceRouter(): Router {
  const router = Router();

  // 工作区总览
  router.get('/', async (_req, res) => {
    try {
      const agents = await detectConnectors();
      const stats = workspaceMemoryHub.stats();
      const recent = workspaceMemoryHub.search(undefined, 10);
      res.json({ agents, memories: { stats, recent } });
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

  return router;
}
