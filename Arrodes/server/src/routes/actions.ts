/**
 * 桌面操作授权 API
 *
 * 高风险操作进入待确认队列后，可通过 REST 或语音/文字「确认」处理。
 * 供前端确认弹窗（Hermes 文件提交后接入）与诊断使用。
 */
import { Router } from 'express';
import { actionGate, RISK_RULES } from '../services/actionGate.js';
import { isDesktopToolsEnabled } from '../services/winops.js';
import { executeToolCall } from '../skills/registry.js';

export function createActionsRouter(): Router {
  const router = Router();

  router.get('/config', (_req, res) => {
    res.json({ enabled: isDesktopToolsEnabled(), risks: RISK_RULES });
  });

  router.get('/pending', (_req, res) => {
    res.json({ pending: actionGate.list() });
  });

  router.post('/:id/confirm', async (req, res) => {
    const item = actionGate.get(String(req.params.id));
    if (!item) {
      res.status(404).json({ error: '待确认操作不存在或已过期', code: 'ACTION_NOT_FOUND' });
      return;
    }
    actionGate.confirm(item.id);
    const result = item.executor
      ? await item.executor(item.args)
      : await executeToolCall(item.skill, item.args);
    res.json({ ok: true, skill: item.skill, result });
  });

  router.post('/:id/cancel', (req, res) => {
    const item = actionGate.get(String(req.params.id));
    if (!item) {
      res.status(404).json({ error: '待确认操作不存在或已过期', code: 'ACTION_NOT_FOUND' });
      return;
    }
    actionGate.deny(item.id);
    res.json({ ok: true, cancelled: item.id });
  });

  return router;
}
