/**
 * 记忆 API 路由
 * 提供记忆查询、搜索、删除功能
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { MemoryRepository } from '../db/memory-repo.js';
import type { MemoryRowWithSession } from '../db/memory-repo.js';

export function createMemoryRouter(): Router {
  const router = Router();
  const memoryRepo = new MemoryRepository();

  // GET /api/v1/memories - 查询记忆列表
  router.get('/', (req: Request, res: Response) => {
    const { q, type, sessionId } = req.query as {
      q?: string;
      type?: string;
      sessionId?: string;
    };

    let memories: MemoryRowWithSession[] = memoryRepo.findAll();

    // 按会话过滤
    if (sessionId) {
      memories = memories.filter((m) => m.sessionId === sessionId);
    }

    // 按类型过滤
    if (type && type !== 'all') {
      memories = memories.filter((m) => m.type === type);
    }

    // 按关键词搜索
    if (q && q.trim()) {
      const keyword = q.toLowerCase();
      memories = memories.filter(
        (m) =>
          m.content.toLowerCase().includes(keyword) ||
          m.type.toLowerCase().includes(keyword),
      );
    }

    res.json({ memories });
  });

  // DELETE /api/v1/memories/:id - 删除单条记忆
  router.delete('/:id', (req: Request<{ id: string }>, res: Response) => {
    const deleted = memoryRepo.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: '记忆未找到', code: 'MEMORY_NOT_FOUND' });
      return;
    }
    res.json({ deleted: true, id: req.params.id });
  });

  // DELETE /api/v1/memories - 清空所有记忆
  router.delete('/', (_req: Request, res: Response) => {
    const count = memoryRepo.clearAll();
    res.json({ deleted: true, count });
  });

  return router;
}
