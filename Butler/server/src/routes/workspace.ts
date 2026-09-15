/**
 * 工作区路由（Agent 工作区 · 兼容层）
 *
 * GET  /api/v1/workspace                       → 连接器列表 + 记忆概览（?ws= 指定工作区）
 * GET  /api/v1/workspace/memories              → 查询记忆（?ws= / ?q= / ?status=pending|confirmed）
 * POST /api/v1/workspace/memories              → 提交记忆（外部来源默认入候选队列）
 * POST /api/v1/workspace/memories/:id/confirm  → 审核通过（候选 → 长期记忆）
 * POST /api/v1/workspace/memories/:id/reject   → 审核拒绝
 * POST /api/v1/workspace/memories/sync-obsidian → 把「已确认」记忆同步到 Obsidian
 *
 * 记忆读写统一走 services/memoryService.ts；本路由只是它的 HTTP 门面。
 * workspace-v2：新 CRUD 走 /api/v1/workspaces（复数），本路由保留向后兼容。
 */
import { Router } from 'express';
import { detectConnectors } from '../workspace/connectors.js';
import { workspaceMemoryHub } from '../workspace/memory-hub.js';
import { workspaceRepo } from '../db/workspace-repo.js';
import { memoryService } from '../services/memoryService.js';
import { listDirectories, listDriveRoots } from '../services/dirBrowser.js';

export function createWorkspaceRouter(): Router {
  const router = Router();

  const wsOf = (req: { query?: unknown; body?: unknown }): string => {
    const q = (req.query as Record<string, unknown> | undefined)?.ws;
    if (typeof q === 'string' && q) return q;
    const b = (req.body as Record<string, unknown> | undefined)?.workspaceId;
    if (typeof b === 'string' && b) return b;
    return 'default';
  };

  // 工作区总览（?ws= 指定工作区，默认 default）
  router.get('/', async (req, res) => {
    try {
      const ws = wsOf(req);
      const agents = await detectConnectors();
      const connected = workspaceRepo.listMembers(ws)
        .filter((m) => m.memberType === 'agent')
        .map((m) => m.memberId);
      const stats = workspaceMemoryHub.stats(ws);
      // 概览只展示已确认记忆（候选在审核队列里单独看）
      const recent = workspaceMemoryHub.searchConfirmed(undefined, 10, ws);
      res.json({ agents, connected, memories: { stats, recent } });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '工作区查询失败' });
    }
  });

  // 记忆查询（默认管理视图：不过滤状态）
  router.get('/memories', (req, res) => {
    try {
      const ws = wsOf(req);
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const memories = status === 'pending'
        ? memoryService.listPending(ws)
        : status === 'confirmed'
          ? memoryService.listConfirmed(ws)
          : workspaceMemoryHub.search(q, limit, ws);
      res.json({ memories });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  // 待审核候选队列
  router.get('/memories/pending', (req, res) => {
    try {
      res.json({ memories: memoryService.listPending(wsOf(req)) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  // 用户通道：控制台手动录入。来源由该路由固定为 user，请求体不得覆盖；
  // 用户显式录入即视为已确认（等同「记住…」）。
  router.post('/memories', (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const record = memoryService.submit({
        content: String(body.content ?? ''),
        source: 'user',
        type: body.type as never,
        scope: body.scope as never,
        projectId: body.projectId ? String(body.projectId) : undefined,
        workspaceId: wsOf(req),
        evidence: body.evidence ? String(body.evidence) : '控制台手动录入',
        confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
        autoConfirm: true,
      });
      res.status(201).json({ memory: record });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '写入失败' });
    }
  });

  // 外部智能体通道：一律产生候选，需用户审核。
  // 来源由该路由固定语义（external / 调用方自报的 agent id），自称 user 会被改写为 external。
  router.post('/memories/candidates', (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const claimed = String(body.source ?? body.sourceAgent ?? '').trim();
      const source = !claimed || claimed === 'user' ? 'external' : claimed;
      const record = memoryService.submit({
        content: String(body.content ?? ''),
        source,
        type: body.type as never,
        scope: body.scope as never,
        projectId: body.projectId ? String(body.projectId) : undefined,
        workspaceId: wsOf(req),
        evidence: body.evidence ? String(body.evidence) : undefined,
        confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
        autoConfirm: false,
      });
      res.status(201).json({ memory: record });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '提交失败' });
    }
  });

  // 审核通过
  router.post('/memories/:id/confirm', (req, res) => {
    try {
      const record = memoryService.confirm(String(req.params.id));
      if (!record) return res.status(404).json({ error: '记忆不存在' });
      res.json({ memory: record });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '确认失败' });
    }
  });

  // 审核拒绝
  router.post('/memories/:id/reject', (req, res) => {
    try {
      const record = memoryService.reject(String(req.params.id));
      if (!record) return res.status(404).json({ error: '记忆不存在' });
      res.json({ memory: record });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '拒绝失败' });
    }
  });

  // 同步「已确认」记忆到 Obsidian（候选与已拒绝不落盘；失效笔记移入归档区）
  router.post('/memories/sync-obsidian', (req, res) => {
    try {
      const result = memoryService.syncToObsidian(wsOf(req));
      res.json({ ok: true, count: result.count, dir: result.dir, archived: result.archived });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '同步失败' });
    }
  });

  // 从 Obsidian 读回并重建 SQLite 索引（权威方向：Obsidian → SQLite）
  router.post('/memories/import-obsidian', (req, res) => {
    try {
      const vaultPath = typeof req.body?.vaultPath === 'string' && req.body.vaultPath
        ? String(req.body.vaultPath)
        : undefined;
      const result = memoryService.importFromObsidian(vaultPath);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '重建失败' });
    }
  });

  // 一次性迁移：旧 memories 表 → 候选队列（幂等，可重复调用）
  router.post('/memories/migrate-legacy', (_req, res) => {
    try {
      const result = memoryService.migrateLegacy();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '迁移失败' });
    }
  });

  // 目录浏览（项目文件夹选择：只列目录，供前端选择器使用）
  router.get('/browse', (req, res) => {
    try {
      const p = typeof req.query.path === 'string' && req.query.path ? String(req.query.path) : process.cwd();
      res.json(listDirectories(p));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '浏览失败' });
    }
  });

  // GET /workspace/roots — 列出可用驱动器根（文件夹选择器起始页）
  router.get('/roots', (_req, res) => {
    res.json({ roots: listDriveRoots() });
  });

  return router;
}
