/**
 * 技能模式路由（借鉴 DeepSeek Harness 的 Agent Preset 选择器）
 * GET  /api/v1/modes           — 列出技能模式与当前模式
 * POST /api/v1/modes/select    — 切换技能模式 { modeId: string }
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getSkillModes, getCurrentMode, setSkillMode,
} from '../services/skillMode.js';

export function createModesRouter(): Router {
  const router = Router();

  // GET /api/v1/modes — 列出所有技能模式
  router.get('/', (_req: Request, res: Response) => {
    res.json({
      modes: getSkillModes().map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        disabledCount: m.disabled.length,
      })),
      current: getCurrentMode().id,
    });
  });

  // POST /api/v1/modes/select — 切换技能模式（即时生效 + 持久化）
  router.post('/select', (req: Request, res: Response) => {
    const { modeId } = req.body as { modeId?: string };
    if (!modeId) {
      res.status(400).json({ error: '请提供 modeId', code: 'MISSING_MODE_ID' });
      return;
    }
    const result = setSkillMode(modeId);
    if (!result.success) {
      res.status(400).json({ error: result.error, code: 'MODE_SWITCH_FAILED' });
      return;
    }
    res.json({ success: true, current: getCurrentMode().id, mode: getCurrentMode() });
  });

  return router;
}
