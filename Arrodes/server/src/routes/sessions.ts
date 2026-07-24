import { Router } from 'express';
import type { Request, Response } from 'express';

export function createSessionRouter(): Router {
  const router = Router();

  // GET /api/sessions - 获取所有会话
  router.get('/', (_req: Request, res: Response) => {
    res.json({ sessions: [] });
  });

  // POST /api/sessions - 创建新会话
  router.post('/', (req: Request, res: Response) => {
    const { title, topic, initialMessage } = req.body;
    // TODO: 创建会话逻辑
    res.status(201).json({
      id: 'placeholder',
      title,
      topic,
      messageCount: 0,
      createdAt: new Date().toISOString(),
    });
  });

  // GET /api/sessions/:id - 获取会话详情
  router.get('/:id', (req: Request, res: Response) => {
    res.json({
      id: req.params.id,
      title: '',
      topic: 'other',
      parentId: null,
      messageCount: 0,
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      summary: '',
      keyMemories: [],
      messages: [],
    });
  });

  // DELETE /api/sessions/:id - 删除会话
  router.delete('/:id', (req: Request, res: Response) => {
    res.json({ deleted: true, id: req.params.id });
  });

  return router;
}
