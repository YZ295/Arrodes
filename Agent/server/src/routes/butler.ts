/**
 * 管家（Butler）API
 * GET  /api/v1/butler/status            引擎状态（运行/停止/异常 + 汇总进度）
 * POST /api/v1/butler/start             启动截图采集引擎（跨实例协调）
 * POST /api/v1/butler/stop              停止截图采集引擎（stop.flag 优雅停止）
 * GET  /api/v1/butler/records/recent    最近采集记录（只读）
 * GET  /api/v1/butler/summary/dates     有汇总数据的日期列表
 * GET  /api/v1/butler/summary/day?ymd=YYYYMMDD  按日 10 分钟段汇总（只读）
 *
 * 挂载于 /api 下，自动处于 localAccess 本地鉴权中间件之后。
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ButlerService } from '../services/butlerService.js';

export function createButlerRouter(service: ButlerService): Router {
  const router = Router();

  router.get('/status', (_req: Request, res: Response) => {
    try {
      res.json(service.getStatus());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/start', async (_req: Request, res: Response) => {
    try {
      const r = await service.start();
      if (r.ok) {
        res.json({ ok: true, pid: r.pid });
      } else {
        res.status(r.code === 'ALREADY_RUNNING' ? 409 : 500).json({ error: r.reason, code: r.code, detail: r.detail });
      }
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/stop', async (_req: Request, res: Response) => {
    try {
      const r = await service.stop();
      if (r.ok) {
        res.json({ ok: true, pid: r.pid });
      } else {
        res.status(r.code === 'NOT_RUNNING' || r.code === 'EXTERNAL_LEGACY' ? 409 : 500)
          .json({ error: r.reason, code: r.code });
      }
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/records/recent', (req: Request, res: Response) => {
    try {
      const raw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 60;
      const limit = Number.isInteger(raw) && raw > 0 && raw <= 200 ? raw : 60;
      res.json({ records: service.recentRecords(limit) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/summary/dates', (_req: Request, res: Response) => {
    try {
      res.json({ dates: service.summaryDates() });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/summary/day', (req: Request, res: Response) => {
    const ymd = typeof req.query.ymd === 'string' ? req.query.ymd : '';
    if (!/^\d{8}$/.test(ymd)) {
      res.status(400).json({ error: 'ymd 必须是 YYYYMMDD 8 位数字日期' });
      return;
    }
    try {
      res.json(service.summaryDay(ymd));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
