/**
 * 工作区成员路由（接入/断开智能体）
 * 挂载于 /api/v1/workspaces/:id/members（mergeParams 取 :id）
 */
import { Router } from 'express';
import { workspaceRepo } from '../db/workspace-repo.js';

export function createWorkspaceMembersRouter(): Router {
  const router = Router({ mergeParams: true });

  // 接入智能体（连线）：memberType 默认 agent
  router.post('/', (req, res) => {
    try {
      const ws = workspaceRepo.get((req.params as Record<string, string>).id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const { memberType, memberId, role } = req.body ?? {};
      const type: 'user' | 'agent' = memberType === 'user' ? 'user' : 'agent';
      if (!memberId || !String(memberId).trim()) {
        res.status(400).json({ error: 'memberId 必填' }); return;
      }
      const member = workspaceRepo.addMember(ws.id, type, String(memberId), role);
      res.status(201).json({ member });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '接入失败' });
    }
  });

  // 断开智能体
  router.delete('/:memberId', (req, res) => {
    try {
      const ws = workspaceRepo.get((req.params as Record<string, string>).id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const removed = workspaceRepo.removeMember(ws.id, 'agent', req.params.memberId);
      if (!removed) { res.status(404).json({ error: '该智能体未接入此工作区' }); return; }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '断开失败' });
    }
  });

  return router;
}
