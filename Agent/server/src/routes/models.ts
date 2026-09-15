/**
 * 模型管理路由
 * GET  /api/v1/models          — 列出可用模型和当前选中
 * POST /api/v1/models/select   — 切换模型 { modelId: string }
 * POST /api/v1/models/custom   — 添加自定义 Provider { label, baseUrl, modelName, apiKey }
 * DELETE /api/v1/models/custom/:id — 删除自定义模型
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  initModelRegistry, getModels, getCurrentModel, getCurrentModelId, setCurrentModel,
  addCustomModel, removeCustomModel,
} from '../services/modelRegistry.js';

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

  // POST /api/v1/models/custom — 添加自定义 Provider
  router.post('/custom', (req: Request, res: Response) => {
    const { label, baseUrl, modelName, apiKey } = req.body as {
      label?: string; baseUrl?: string; modelName?: string; apiKey?: string;
    };
    const result = addCustomModel({ label: label || '', baseUrl: baseUrl || '', modelName: modelName || '', apiKey: apiKey || '' });
    if (!result.success) {
      res.status(400).json({ error: result.error, code: 'CUSTOM_MODEL_ADD_FAILED' });
      return;
    }
    res.status(201).json({ success: true, id: result.id });
  });

  // DELETE /api/v1/models/custom/:id — 删除自定义模型
  router.delete('/custom/:id', (req: Request, res: Response) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = removeCustomModel(id);
    if (!result.success) {
      res.status(404).json({ error: result.error, code: 'CUSTOM_MODEL_NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  });

  return router;
}
