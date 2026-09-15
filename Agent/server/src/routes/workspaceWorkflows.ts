/**
 * 开发工作流路由（工作区级）
 * 挂载于 /api/v1/workspaces/:id/workflows
 *
 * POST   /            → 创建（title 必填；projectDir/sourceSeminarId 可选）
 * GET    /            → 列表（按工作区隔离）
 * GET    /:wfId       → 详情（workflow + steps）
 * POST   /:wfId/advance → 推进阶段（可选登记当前阶段产出物）
 * POST   /:wfId/steps → 更新步骤状态/产出/备注
 */
import { Router } from 'express';
import { workspaceRepo } from '../db/workspace-repo.js';
import { devWorkflowRepo, DEV_WORKFLOW_STAGES } from '../db/dev-workflow-repo.js';

export function createWorkspaceWorkflowsRouter(): Router {
  const router = Router({ mergeParams: true });

  const getWs = (req: { params: Record<string, string> }) => workspaceRepo.get(req.params.id);

  router.post('/', (req, res) => {
    try {
      const ws = getWs(req);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const title = String(req.body?.title ?? '').trim();
      if (!title) { res.status(400).json({ error: '标题不能为空' }); return; }
      const workflow = devWorkflowRepo.create({
        workspaceId: ws.id,
        title,
        projectDir: req.body?.projectDir !== undefined ? String(req.body.projectDir) : undefined,
        sourceSeminarId: req.body?.sourceSeminarId !== undefined
          ? String(req.body.sourceSeminarId)
          : undefined,
      });
      res.status(201).json({ workflow });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '创建失败' });
    }
  });

  router.get('/', (req, res) => {
    try {
      const ws = getWs(req);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({ workflows: devWorkflowRepo.list(ws.id) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  router.get('/:wfId', (req, res) => {
    try {
      const ws = getWs(req);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const workflow = devWorkflowRepo.get(req.params.wfId);
      if (!workflow || workflow.workspaceId !== ws.id) {
        res.status(404).json({ error: '工作流不存在' }); return;
      }
      res.json({ workflow, steps: devWorkflowRepo.steps(workflow.id) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  router.post('/:wfId/advance', (req, res) => {
    try {
      const ws = getWs(req);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const workflow = devWorkflowRepo.get(req.params.wfId);
      if (!workflow || workflow.workspaceId !== ws.id) {
        res.status(404).json({ error: '工作流不存在' }); return;
      }
      const advanced = devWorkflowRepo.advance(workflow.id, {
        artifactPath: req.body?.artifactPath !== undefined ? String(req.body.artifactPath) : undefined,
        notes: req.body?.notes !== undefined ? String(req.body.notes) : undefined,
      });
      res.json({ workflow: advanced });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '推进失败' });
    }
  });

  router.post('/:wfId/steps', (req, res) => {
    try {
      const ws = getWs(req);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const workflow = devWorkflowRepo.get(req.params.wfId);
      if (!workflow || workflow.workspaceId !== ws.id) {
        res.status(404).json({ error: '工作流不存在' }); return;
      }
      const stage = String(req.body?.stage ?? '');
      if (!(DEV_WORKFLOW_STAGES as readonly string[]).includes(stage)) {
        res.status(400).json({ error: `未知阶段: ${stage}` }); return;
      }
      const step = devWorkflowRepo.updateStep(workflow.id, stage as typeof DEV_WORKFLOW_STAGES[number], {
        status: req.body?.status,
        artifactPath: req.body?.artifactPath !== undefined ? String(req.body.artifactPath) : undefined,
        notes: req.body?.notes !== undefined ? String(req.body.notes) : undefined,
      });
      if (!step) { res.status(404).json({ error: '步骤不存在' }); return; }
      res.json({ step });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '更新失败' });
    }
  });

  return router;
}
