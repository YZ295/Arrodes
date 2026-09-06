/**
 * Wallpaper Engine 路由（壁纸插件）
 *
 * GET  /api/v1/wallpaper             — 连接状态 + 当前壁纸 + 壁纸列表
 * POST /api/v1/wallpaper/apply       — 应用壁纸 { id, monitor? }
 * GET  /api/v1/wallpaper/preview/:id — 预览图（白名单 + Cache-Control）
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  WallpaperEngine,
  WallpaperError,
} from '../services/wallpaperEngine.js';

export function createWallpaperRouter(
  engine: WallpaperEngine = new WallpaperEngine(),
): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json(engine.getOverview());
  });

  router.post('/apply', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { id?: unknown; monitor?: unknown };
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      res.status(400).json({ error: '请提供壁纸 id' });
      return;
    }
    const monitor = typeof body.monitor === 'number' ? body.monitor : undefined;
    try {
      await engine.apply(id, monitor);
      res.json({ ok: true, id });
    } catch (err) {
      if (err instanceof WallpaperError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: '应用壁纸失败' });
    }
  });

  router.get('/preview/:id', (req: Request, res: Response) => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    let id = raw;
    try {
      id = decodeURIComponent(id);
    } catch {
      res.status(404).json({ error: '预览不存在' });
      return;
    }
    const preview = engine.resolvePreview(id);
    if (!preview) {
      res.status(404).json({ error: '预览不存在' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type(preview.mime);
    res.sendFile(preview.path, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: '预览读取失败' });
      }
    });
  });

  return router;
}
