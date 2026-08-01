/**
 * 服务端语音识别 (STT)
 *
 * 解决 Electron 壳内浏览器 SpeechRecognition 不可用的问题（报 network 错误）。
 * 前端把录音 Blob 上传到这里，转发给 OpenAI 兼容的 ASR 服务：
 * - SiliconFlow SenseVoiceSmall（免费额度，中文顶尖）—— 首选
 * - 可替换为任何 OpenAI 兼容 /v1/audio/transcriptions 端点
 */
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

export function createSttRouter(): Router {
  const router = Router();

  // 状态检查：服务端 STT 是否可用（前端据此决定识别路径）
  router.get('/status', (_req, res) => {
    res.json({
      available: !!config.siliconflowApiKey,
      provider: 'siliconflow',
      model: 'SenseVoiceSmall',
    });
  });

  router.post('/transcribe', upload.single('audio'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: '缺少音频文件（字段名 audio）' });
      return;
    }
    if (!config.siliconflowApiKey) {
      res.status(503).json({ error: 'SILICONFLOW_API_KEY 未配置，无法使用服务端语音识别' });
      return;
    }

    try {
      const form = new FormData();
      // SenseVoiceSmall 期望 wav/flac/mp3/m4a/webm；webm(opus) 也可，格式由服务端探测
      const filename = req.file.originalname && req.file.originalname.length > 0
        ? req.file.originalname
        : `audio-${Date.now()}.webm`;
      // Buffer<ArrayBufferLike> 与 BlobPart 泛型不匹配（TS7），取底层 ArrayBuffer
      const audioBytes = req.file.buffer.buffer.slice(
        req.file.buffer.byteOffset,
        req.file.buffer.byteOffset + req.file.buffer.byteLength,
      ) as ArrayBuffer;
      form.append('file', new Blob([audioBytes], { type: req.file.mimetype }), filename);
      form.append('model', 'SenseVoiceSmall');

      const resp = await fetch(`${config.siliconflowBaseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${config.siliconflowApiKey}` },
        body: form,
        signal: AbortSignal.timeout(30000),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        console.error('[STT] SiliconFlow 错误:', resp.status, errBody.slice(0, 200));
        res.status(502).json({ error: `语音识别服务错误 (${resp.status})` });
        return;
      }

      const data = await resp.json() as { text?: string };
      const text = (data.text || '').trim();
      if (!text) {
        res.status(422).json({ error: '未识别到语音内容' });
        return;
      }
      res.json({ text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      console.error('[STT] 服务端识别异常:', msg);
      res.status(500).json({ error: `语音识别失败: ${msg}` });
    }
  });

  return router;
}
