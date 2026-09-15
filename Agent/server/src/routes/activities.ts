/**
 * 活动周期 API
 * GET  /api/v1/activities?date=YYYY-MM-DD  当天周期列表 + 分类计数
 * PATCH /api/v1/activities/:id             编辑周期（重命名/分类/标签）
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { listToday, updatePeriod } from '../services/activityAggregator.js';

export function createActivitiesRouter(): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    try {
      const now = Date.now();
      // 可选 date 参数（YYYY-MM-DD，按本地时区偏移）
      let nowArg = now;
      const date = typeof req.query.date === 'string' ? req.query.date : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [y, m, d] = date.split('-').map(Number);
        const target = new Date(y, m - 1, d).getTime();
        // 只回历史数据：若查询的是今天则用当前时间
        const todayStart = new Date(now).setHours(0, 0, 0, 0);
        nowArg = target === todayStart ? now : target + 24 * 60 * 60 * 1000 - 1;
      }
      res.json({ ok: true, data: listToday(nowArg) });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  router.patch('/:id', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ ok: false, error: 'invalid id' });
        return;
      }
      const patch = req.body as { name?: string; category?: string; tag?: string | null };
      const updated = updatePeriod(id, patch);
      if (!updated) {
        res.status(404).json({ ok: false, error: 'not found or nothing to update' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
