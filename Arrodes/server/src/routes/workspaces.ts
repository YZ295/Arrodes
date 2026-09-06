/**
 * 工作区路由 v2（多智能体协作工作区 · Phase B1 隔离）
 *
 * GET    /api/v1/workspaces          → 工作区列表（含概览）
 * POST   /api/v1/workspaces          → 创建
 * GET    /api/v1/workspaces/:id      → 详情（含成员）
 * PATCH  /api/v1/workspaces/:id      → 改名/换图标/归档
 * DELETE /api/v1/workspaces/:id      → 归档（软删除）
 *
 * 子路由：
 *   /:id/members → workspaceMembers.ts（接入/断开）
 *   /:id/agents  → workspaceAgents.ts（对话/历史/任务/记忆）
 */
import { Router } from 'express';
import { workspaceRepo } from '../db/workspace-repo.js';
import { createWorkspaceMembersRouter } from './workspaceMembers.js';
import { createWorkspaceAgentsRouter } from './workspaceAgents.js';
import { createWorkspaceWorkflowsRouter } from './workspaceWorkflows.js';
import { workspaceProjectDir } from '../services/workspaceProjectDir.js';
import { importWorkbuddyNotes } from '../services/workbuddyMemory.js';
import { normalizeAuthorizedDirs } from '../services/workspaceFileAccess.js';

const PROTECTED_FILE_CONFIG_FIELDS = new Set(['projectDir', 'authorizedDirs', 'permission']);

function validateGenericConfigPatch(input: unknown): Record<string, unknown> | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('config 必须是对象');
  }
  const patch = input as Record<string, unknown>;
  for (const key of PROTECTED_FILE_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      throw new Error(`${key} 必须使用专用字段更新`);
    }
  }
  return patch;
}

function normalizeProjectDir(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const projectDir = String(value).trim();
  return projectDir ? normalizeAuthorizedDirs([projectDir])[0] : '';
}

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
      const { name, kind, icon, projectDir } = req.body ?? {};
      if (!name || !String(name).trim()) {
        res.status(400).json({ error: 'name 必填' }); return;
      }
      const ws = workspaceRepo.create({
        name: String(name),
        kind: kind ? String(kind) : undefined,
        icon: icon ? String(icon) : undefined,
        projectDir: projectDir !== undefined ? String(projectDir) : undefined,
      });
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

  // 成员与 Agent 交互子路由
  router.use('/:id/members', createWorkspaceMembersRouter());
  router.use('/:id/agents', createWorkspaceAgentsRouter());
  router.use('/:id/workflows', createWorkspaceWorkflowsRouter());

  // 导入 WorkBuddy 记忆（.workbuddy/memory/*.md → 统一共享记忆）
  router.post('/:id/workbuddy/import', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const result = importWorkbuddyNotes(workspaceProjectDir(ws), ws.id);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '导入失败' });
    }
  });

  router.patch('/:id', (req, res) => {
    try {
      const { name, icon, status, config, projectDir, permission, canvas, authorizedDirs } = req.body ?? {};
      // 画布位置：与现有 config 合并（projectDir/permission 走专门字段，避免整体替换丢配置）
      const configPatch = validateGenericConfigPatch(config);
      let mergedConfig = configPatch;
      if (canvas !== undefined) {
        mergedConfig = { ...(configPatch ?? {}), canvas };
      }
      const ws = workspaceRepo.update(req.params.id, {
        name: name !== undefined ? String(name) : undefined,
        icon: icon !== undefined ? String(icon) : undefined,
        status,
        config: mergedConfig,
        projectDir: normalizeProjectDir(projectDir),
        permission: permission !== undefined ? String(permission) : undefined,
        authorizedDirs: authorizedDirs !== undefined ? normalizeAuthorizedDirs(authorizedDirs) : undefined,
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
