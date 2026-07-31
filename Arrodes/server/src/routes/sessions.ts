import { Router } from 'express';
import type { Request, Response } from 'express';
import { SessionRepository } from '../db/session-repo.js';
import { MessageRepository } from '../db/message-repo.js';
import { validateBody } from '../middleware/validate.js';
import type { CreateSessionRequest } from '../../../shared/types/index.js';

const VALID_TOPICS = ['work', 'life', 'creative', 'emotion', 'study', 'other'];

export function createSessionRouter(): Router {
  const router = Router();
  const sessionRepo = new SessionRepository();
  const messageRepo = new MessageRepository();

  // GET /api/sessions - 获取所有会话
  router.get('/', (_req: Request, res: Response) => {
    const sessions = sessionRepo.findAll();
    res.json({ sessions });
  });

  // POST /api/sessions - 创建新会话
  router.post('/',
    validateBody({
      title: { required: true, type: 'string', minLength: 1, maxLength: 200 },
      topic: { required: true, type: 'string', enum: VALID_TOPICS },
    }),
    (req: Request, res: Response) => {
      const { title, topic, parentId, initialMessage } = req.body as CreateSessionRequest;
      const session = sessionRepo.create({ title, topic, parentId, initialMessage });
      res.status(201).json(session);
    });

  // GET /api/sessions/:id - 获取会话详情（含消息和记忆）
  router.get('/:id', (req: Request<{ id: string }>, res: Response) => {
    const detail = sessionRepo.findById(req.params.id);
    if (!detail) {
      res.status(404).json({ error: '会话未找到', code: 'SESSION_NOT_FOUND' });
      return;
    }
    res.json(detail);
  });

  // DELETE /api/sessions/:id - 删除会话
  router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
    const deleted = sessionRepo.delete(req.params.id);
    res.json({ deleted, id: req.params.id });
  });

  // PATCH /api/sessions/:id - 更新会话（重命名）
  router.patch('/:id',
    validateBody({ title: { required: true, type: 'string', minLength: 1, maxLength: 200 } }),
    (req: Request<{ id: string }>, res: Response) => {
      const { title } = req.body as { title: string };
      const session = sessionRepo.updateTitle(req.params.id, title.trim());
      if (!session) {
        res.status(404).json({ error: '会话未找到', code: 'SESSION_NOT_FOUND' });
        return;
      }
      res.json(session);
    });

  return router;
}
