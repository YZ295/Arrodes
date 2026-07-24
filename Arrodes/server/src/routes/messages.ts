import { Router } from 'express';
import type { Request, Response } from 'express';

export function createMessageRouter(): Router {
  const router = Router();

  // GET /api/messages/:sessionId - 获取会话消息
  router.get('/:sessionId', (req: Request, res: Response) => {
    res.json({ messages: [] });
  });

  return router;
}
