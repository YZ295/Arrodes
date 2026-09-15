/**
 * 服务端语音识别 (STT)
 *
 * 解决 Electron 壳内浏览器 SpeechRecognition 不可用的问题（报 network 错误）。
 * D2=C 混合策略：默认在线 SiliconFlow；可切换 local（faster-whisper 侧车）
 * 与 auto（本地优先，失败回退在线）。模式持久化于 data/stt-mode.json。
 */
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { transcribeAudio, STT_MODES, isSttMode } from '../services/sttService.js';
import { getSttMode, setSttMode } from '../services/sttSettings.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

export function createSttRouter(): Router {
  const router = Router();

  // 状态检查：服务端 STT 是否可用 + 当前模式（前端据此决定识别路径）
  router.get('/status', (_req, res) => {
    res.json({
      available: !!config.siliconflowApiKey,
      provider: 'siliconflow',
      model: 'SenseVoiceSmall',
      mode: getSttMode(),
    });
  });

  // 当前 STT 模式
  router.get('/mode', (_req, res) => {
    res.json({ mode: getSttMode(), modes: STT_MODES });
  });

  // 切换 STT 模式（持久化，重启保留）
  router.post('/mode', (req, res) => {
    const mode = req.body?.mode;
    if (!isSttMode(mode)) {
      res.status(400).json({ error: `mode 必须是 ${STT_MODES.join('/')} 之一` });
      return;
    }
    setSttMode(mode);
    res.json({ mode });
  });

  router.post('/transcribe', upload.single('audio'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: '缺少音频文件（字段名 audio）' });
      return;
    }
    try {
      const filename = req.file.originalname || `audio-${Date.now()}.webm`;
      const outcome = await transcribeAudio(getSttMode(), req.file.buffer, filename, req.file.mimetype, {
        fetchFn: fetch,
        localUrl: 'http://127.0.0.1:12002',
        siliconflowBaseUrl: config.siliconflowBaseUrl,
        siliconflowApiKey: config.siliconflowApiKey,
      });
      res.json({ text: outcome.text, engine: outcome.engine, usedFallback: outcome.usedFallback ?? false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      console.error('[STT] 识别异常:', msg);
      const status = /未配置/.test(msg) ? 503 : /未识别到语音/.test(msg) ? 422 : 500;
      res.status(status).json({ error: `语音识别失败: ${msg}` });
    }
  });

  return router;
}
