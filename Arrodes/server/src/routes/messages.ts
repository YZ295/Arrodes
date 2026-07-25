import { Router } from 'express';
import type { Request, Response } from 'express';
import { MessageRepository } from '../db/message-repo.js';

export function createMessageRouter(): Router {
  const router = Router();
  const messageRepo = new MessageRepository();

  // GET /api/messages/:sessionId - 获取会话消息
  router.get('/:sessionId', (req: Request<{ sessionId: string }>, res: Response) => {
    const messages = messageRepo.findBySession(req.params.sessionId);
    res.json({ messages });
  });

  return router;
}