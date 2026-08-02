/**
 * TTS API 路由
 * 提供文本转语音能力（Edge TTS）
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { ttsService, getTtsStats } from '../services/ttsService.js';

export function createTtsRouter(): Router {
  const router = Router();

  // POST /api/v1/tts/synthesize - 文本转语音
  router.post('/synthesize', async (req: Request, res: Response): Promise<void> => {
    try {
      const { text, voice, rate, pitch, engine } = req.body as {
        text?: string;
        voice?: string;
        rate?: number;
        pitch?: number;
        engine?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: '文本不能为空', code: 'EMPTY_TEXT' });
        return;
      }

      if (text.length > 2000) {
        res.status(400).json({ error: '文本过长（最多 2000 字）', code: 'TEXT_TOO_LONG' });
        return;
      }

      const result = await ttsService.synthesize({
        text: text.trim(),
        voice,
        rate,
        pitch,
        engine: engine as any,
      });

      // 返回 Base64 音频
      // 前端可以直接用 data:${contentType};base64,${audioBase64} 播放
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS 合成失败';
      res.status(500).json({ error: msg, code: 'TTS_ERROR' });
    }
  });

  // GET /api/v1/tts/voices - 获取可用音色列表
  router.get('/voices', (_req: Request, res: Response) => {
    const voices = ttsService.getVoices();
    res.json({ voices });
  });

  // GET /api/v1/tts/status - 服务状态 + 失败统计（诊断用）
  router.get('/status', (_req: Request, res: Response) => {
    res.json({ status: 'ok', stats: getTtsStats() });
  });

  return router;
}
