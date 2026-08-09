/**
 * Prompt Shell API 路由（可精炼外壳管理）
 *
 * GET  /api/v1/prompt-shell         - 查看当前外壳状态
 * POST /api/v1/prompt-shell/entries - 追加外壳条目 { entry }
 * DELETE /api/v1/prompt-shell/entries/:encoded - 删除条目（URL 编码内容）
 * POST /api/v1/prompt-shell/rollback - 回滚到上一版本快照
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getPromptShellState, updatePromptShell, removePromptShellEntry, rollbackPromptShell,
} from '../services/promptShell.js';

export function createPromptShellRouter(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json(getPromptShellState());
  });

  router.post('/entries', (req: Request, res: Response) => {
    const entry = String(req.body?.entry || '').trim();
    if (!entry || entry.length > 500) {
      res.status(400).json({ error: 'entry 必填且 ≤500 字符', code: 'BAD_ENTRY' });
      return;
    }
    const version = updatePromptShell(entry);
    res.json({ ok: true, version });
  });

  router.delete('/entries/:encoded', (req: Request, res: Response) => {
    const encoded = Array.isArray(req.params.encoded) ? req.params.encoded[0] : req.params.encoded;
    const entry = decodeURIComponent(encoded);
    const version = removePromptShellEntry(entry);
    res.json({ ok: true, version });
  });

  router.post('/rollback', (req: Request, res: Response) => {
    const version = rollbackPromptShell();
    res.json({ ok: true, version });
  });

  return router;
}
