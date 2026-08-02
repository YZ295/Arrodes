import { Router } from 'express';
import { usageService } from '../services/usageService.js';

/**
 * 用量与额度 API
 * GET /api/v1/usage            → 今日/本月用量 + 限额 + 是否允许继续
 * GET /api/v1/usage/recent     → 最近 N 条消耗明细
 */
export function createUsageRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      const stats = usageService.getStats();
      res.json({ stats });
    } catch (err) {
      res.status(500).json({ error: `用量查询失败: ${err instanceof Error ? err.message : '未知错误'}` });
    }
  });

  router.get('/recent', (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    try {
      res.json({ records: usageService.recent(limit) });
    } catch (err) {
      res.status(500).json({ error: `明细查询失败: ${err instanceof Error ? err.message : '未知错误'}` });
    }
  });

  return router;
}
