import { Router } from 'express';
import type { Request, Response } from 'express';
import { SessionRepository } from '../db/session-repo.js';
import { MessageRepository } from '../db/message-repo.js';
import { createZodValidator } from '../middleware/zod-validate.js';
import type { CreateSessionRequest } from '../../../shared/types/index.js';
import { z } from 'zod';

export const sessionSchemas = {
  create: z.object({
    title: z.string().min(1).max(200),
    topic: z.enum(['work', 'life', 'creative', 'emotion', 'study', 'other']),
    parentId: z.string().optional(),
    initialMessage: z.string().optional(),
    workspaceId: z.string().optional(),
  }),
  rename: z.object({
    title: z.string().min(1).max(200),
  }),
};

export function createSessionRouter(): Router {
  const router = Router();
  const sessionRepo = new SessionRepository();
  const messageRepo = new MessageRepository();

  // GET /api/sessions - 获取所有会话（?ws= 按工作区过滤，?archived=1 只看归档）
  router.get('/', (req: Request, res: Response) => {
    const ws = typeof req.query.ws === 'string' && req.query.ws ? String(req.query.ws) : undefined;
    const archived = req.query.archived === '1' ? true : req.query.archived === '0' ? false : undefined;
    const sessions = sessionRepo.findAll(ws, archived !== undefined ? { archived } : {});
    res.json({ sessions });
  });

  // POST /api/sessions - 创建新会话（body.workspaceId 可选，默认 default）
  router.post('/',
    createZodValidator(sessionSchemas.create),
    (req: Request, res: Response) => {
      const { title, topic, parentId, initialMessage, workspaceId } = req.body as CreateSessionRequest & { workspaceId?: string };
      const session = sessionRepo.create({ title, topic, parentId, initialMessage, workspaceId: workspaceId || 'default' });
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
    createZodValidator(sessionSchemas.rename),
    (req: Request<{ id: string }>, res: Response) => {
      const { title } = req.body as { title: string };
      const session = sessionRepo.updateTitle(req.params.id, title.trim());
      if (!session) {
        res.status(404).json({ error: '会话未找到', code: 'SESSION_NOT_FOUND' });
        return;
      }
      res.json(session);
    });

  // POST /api/sessions/:id/archive - 归档会话
  router.post('/:id/archive', (req: Request<{ id: string }>, res: Response) => {
    const ok = sessionRepo.archive(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '会话未找到', code: 'SESSION_NOT_FOUND' });
      return;
    }
    res.json({ archived: true, id: req.params.id });
  });

  // POST /api/sessions/:id/unarchive - 取消归档
  router.post('/:id/unarchive', (req: Request<{ id: string }>, res: Response) => {
    const ok = sessionRepo.unarchive(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '会话未找到', code: 'SESSION_NOT_FOUND' });
      return;
    }
    res.json({ archived: false, id: req.params.id });
  });

  // POST /api/sessions/archive-stale - 回收过期会话（自动归档 N 天未活跃）
  router.post('/archive-stale', (req: Request, res: Response) => {
    const days = typeof req.body?.days === 'number' ? Math.min(Math.max(req.body.days, 1), 365) : 30;
    const count = sessionRepo.autoArchiveStale(days);
    res.json({ recycled: count, days });
  });

  return router;
}
