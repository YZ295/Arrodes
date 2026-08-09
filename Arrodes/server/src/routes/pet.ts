/**
 * Pet API 路由（桌宠 TheFool 数据源）
 * GET /api/v1/pet/status - 当前任务 + 最近结果（桌宠轮询）
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { getPetStatus } from '../services/petStatus.js';

export function createPetRouter(): Router {
  const router = Router();

  router.get('/status', (_req: Request, res: Response) => {
    res.json(getPetStatus());
  });

  return router;
}
