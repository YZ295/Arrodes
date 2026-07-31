/**
 * 模型管理路由
 * GET  /api/v1/models         — 列出可用模型和当前选中
 * POST /api/v1/models/select  — 切换模型 { modelId: string }
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { initModelRegistry, getModels, getCurrentModel, getCurrentModelId, setCurrentModel } from '../services/modelRegistry.js';

// 确保注册表已初始化
initModelRegistry();

export function createModelRouter(): Router {
  const router = Router();

  // GET /api/v1/models — 列出所有模型
  router.get('/', (_req: Request, res: Response) => {
    const models = getModels().map((m) => ({
      id: m.id,
      label: m.label,
      provider: m.provider,
      isFree: m.isFree,
      description: m.description,
    }));

    res.json({
      models,
      current: getCurrentModelId(),
      currentDetail: {
        id: getCurrentModel().id,
        label: getCurrentModel().label,
        provider: getCurrentModel().provider,
      },
    });
  });

  // POST /api/v1/models/select — 切换模型
  router.post('/select', (req: Request, res: Response) => {
    const { modelId } = req.body as { modelId?: string };

    if (!modelId) {
      res.status(400).json({ error: '请提供 modelId', code: 'MISSING_MODEL_ID' });
      return;
    }

    const result = setCurrentModel(modelId);
    if (!result.success) {
      res.status(400).json({ error: result.error, code: 'MODEL_SWITCH_FAILED' });
      return;
    }

    res.json({
      success: true,
      current: getCurrentModelId(),
      model: {
        id: getCurrentModel().id,
        label: getCurrentModel().label,
        provider: getCurrentModel().provider,
      },
    });
  });

  return router;
}
