/**
 * 桌面操作授权 API
 *
 * 高风险操作进入待确认队列后，可通过 REST 或语音/文字「确认」处理。
 * 供前端确认弹窗（文件提交后接入）与诊断使用。
 */
import { Router } from 'express';
import { actionGate, RISK_RULES, type ActionOwner, type PendingAction } from '../services/actionGate.js';
import { isDesktopToolsEnabled } from '../services/winops.js';
import { executeToolCall } from '../skills/registry.js';
import { SessionRepository } from '../db/session-repo.js';

function toPublicPending(item: PendingAction) {
  return {
    id: item.id,
    skill: item.skill,
    description: item.description,
    risk: item.risk,
    createdAt: item.createdAt,
  };
}

export function createActionsRouter(): Router {
  const router = Router();
  const sessionRepo = new SessionRepository();

  const ownerFromSession = (sessionId: unknown): ActionOwner | null => {
    if (typeof sessionId !== 'string' || !sessionId) return null;
    const workspaceId = sessionRepo.findWorkspaceId(sessionId);
    return workspaceId ? { localUserId: 'local-user', workspaceId, sessionId } : null;
  };

  const requireOwner = (sessionId: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }): ActionOwner | null => {
    if (typeof sessionId !== 'string' || !sessionId) {
      res.status(400).json({ error: 'sessionId 必填', code: 'SESSION_REQUIRED' });
      return null;
    }
    const owner = ownerFromSession(sessionId);
    if (!owner) {
      res.status(404).json({ error: '会话不存在或无工作区归属', code: 'SESSION_NOT_FOUND' });
      return null;
    }
    return owner;
  };

  router.get('/config', (_req, res) => {
    res.json({ enabled: isDesktopToolsEnabled(), risks: RISK_RULES });
  });

  router.get('/pending', (req, res) => {
    const owner = requireOwner(req.query.sessionId, res);
    if (!owner) return;
    res.json({ pending: actionGate.listForOwner(owner).map(toPublicPending) });
  });

  router.post('/:id/confirm', async (req, res) => {
    const owner = requireOwner(req.body?.sessionId, res);
    if (!owner) return;
    const item = actionGate.confirmForOwner(String(req.params.id), owner);
    if (!item) {
      res.status(404).json({ error: '待确认操作不存在或已过期', code: 'ACTION_NOT_FOUND' });
      return;
    }
    try {
      const result = item.executor
        ? await item.executor(item.args)
        : await executeToolCall(item.skill, item.args);
      res.json({ ok: true, skill: item.skill, result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '动作执行失败', code: 'ACTION_EXECUTION_FAILED' });
    }
  });

  router.post('/:id/cancel', (req, res) => {
    const owner = requireOwner(req.body?.sessionId, res);
    if (!owner) return;
    const item = actionGate.denyForOwner(String(req.params.id), owner);
    if (!item) {
      res.status(404).json({ error: '待确认操作不存在或已过期', code: 'ACTION_NOT_FOUND' });
      return;
    }
    actionGate.deny(item.id);
    res.json({ ok: true, cancelled: item.id });
  });

  return router;
}
