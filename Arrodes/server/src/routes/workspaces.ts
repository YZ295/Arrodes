/**
 * 工作区路由 v2（多智能体协作工作区 · Phase B1 隔离）
 *
 * GET    /api/v1/workspaces            → 工作区列表（含概览）
 * POST   /api/v1/workspaces            → 创建
 * GET    /api/v1/workspaces/:id        → 详情
 * PATCH  /api/v1/workspaces/:id        → 改名/换图标/归档
 * DELETE /api/v1/workspaces/:id        → 归档（软删除）
 */
import { Router } from 'express';
import { workspaceRepo } from '../db/workspace-repo.js';

export function createWorkspacesRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      const workspaces = workspaceRepo.list().map((w) => ({
        ...w,
        stats: workspaceRepo.stats(w.id),
      }));
      res.json({ workspaces });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  router.post('/', (req, res) => {
    try {
      const { name, kind, icon } = req.body ?? {};
      if (!name || !String(name).trim()) {
        res.status(400).json({ error: 'name 必填' }); return;
      }
      const ws = workspaceRepo.create({ name: String(name), kind: kind ? String(kind) : undefined, icon: icon ? String(icon) : undefined });
      res.status(201).json({ workspace: ws });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '创建失败' });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({
        workspace: ws,
        stats: workspaceRepo.stats(ws.id),
        members: workspaceRepo.listMembers(ws.id),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  // 接入智能体（连线）：memberType 默认 agent
  router.post('/:id/members', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
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
  router.delete('/:id/members/:memberId', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const removed = workspaceRepo.removeMember(ws.id, 'agent', req.params.memberId);
      if (!removed) { res.status(404).json({ error: '该智能体未接入此工作区' }); return; }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '断开失败' });
    }
  });

  router.patch('/:id', (req, res) => {
    try {
      const { name, icon, status, config } = req.body ?? {};
      const ws = workspaceRepo.update(req.params.id, {
        name: name !== undefined ? String(name) : undefined,
        icon: icon !== undefined ? String(icon) : undefined,
        status,
        config,
      });
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({ workspace: ws });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '更新失败' });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      if (req.params.id === 'default') {
        res.status(400).json({ error: '默认工作区不可归档' }); return;
      }
      const ws = workspaceRepo.archive(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({ workspace: ws });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '归档失败' });
    }
  });

  return router;
}
