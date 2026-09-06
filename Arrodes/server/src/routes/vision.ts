/**
 * 视觉 API 路由
 * 提供 Qwen3-VL 多模态视觉理解能力
 */
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { visionService, checkVisionModel, MAX_VISION_IMAGE_BYTES } from '../services/visionService.js';
import { enrichScreenObservation } from '../services/visionEnrichment.js';
import { existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';

// ===== 文件上传配置 (multer) =====

const UPLOAD_DIR = './uploads/vision';
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: MAX_VISION_IMAGE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的图片格式: ${file.mimetype}，支持: ${allowed.join(', ')}`));
    }
  },
});

// ===== 路由 =====

export function createVisionRouter(): Router {
  const router = Router();
  const cleanupUpload = async (filePath: string | undefined): Promise<void> => {
    if (filePath) await unlink(filePath).catch(() => {});
  };

  // GET /api/v1/vision/status - 查看视觉模型状态
  router.get('/status', async (_req: Request, res: Response) => {
    const status = await checkVisionModel();
    res.json(status);
  });

  // POST /api/v1/vision/analyze - 分析上传的图片 (multipart)
  router.post('/analyze', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
    const filePath = req.file?.path;
    try {
      if (!req.file) {
        res.status(400).json({ error: '请上传一张图片', code: 'NO_IMAGE' });
        return;
      }

      // 读取上传文件转 Base64
      const fs = await import('node:fs/promises');
      const buffer = await fs.readFile(req.file.path);
      const base64 = buffer.toString('base64');
      const prompt = req.body.prompt as string | undefined;

      // 校验图片
      const validation = visionService.validateImage(base64, req.file.mimetype.split('/')[1]);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error, code: 'INVALID_IMAGE' });
        return;
      }

      // 分析图片
      const result = await visionService.analyze({
        imageBase64: base64,
        imageFormat: validation.format,
        prompt,
      });

      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '视觉分析失败';
      res.status(500).json({ error: msg, code: 'VISION_ERROR' });
    } finally {
      await cleanupUpload(filePath);
    }
  });

  // POST /api/v1/vision/analyze-base64 - 分析 Base64 图片 (JSON body)
  router.post('/analyze-base64', async (req: Request, res: Response): Promise<void> => {
    try {
      const { imageBase64, imageFormat, prompt } = req.body as {
        imageBase64?: string;
        imageFormat?: string;
        prompt?: string;
      };

      if (!imageBase64) {
        res.status(400).json({ error: '缺少 imageBase64 字段', code: 'NO_IMAGE' });
        return;
      }

      // 校验图片
      const validation = visionService.validateImage(imageBase64, imageFormat);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error, code: 'INVALID_IMAGE' });
        return;
      }

      const result = await visionService.analyze({
        imageBase64,
        imageFormat: validation.format,
        prompt,
      });

      // 屏幕观察增强：视觉模型输出的 4 字段 JSON 由 DeepSeek 推断高阶字段；失败原样返回
      const enrichedDescription = await enrichScreenObservation(result.description);
      res.json({ ...result, description: enrichedDescription });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '视觉分析失败';
      res.status(500).json({ error: msg, code: 'VISION_ERROR' });
    }
  });

  router.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    void cleanupUpload(req.file?.path).finally(() => {
      const message = err instanceof Error ? err.message : '视觉上传失败';
      res.status(400).json({ error: message, code: 'INVALID_IMAGE' });
    });
  });

  return router;
}
