/**
 * TTS API 路由
 * 提供文本转语音能力（本地 CosyVoice）+ 自定义音色管理（T9）
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, readdirSync, readFileSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ttsService, getTtsStats } from '../services/ttsService.js';

// ESM 兼容的 __dirname（package.json type: module）
const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 自定义音色存储目录（侧车可读：tts-sidecar/custom-voices/）
const CUSTOM_VOICE_DIR = resolve(__dirname, '../../tts-sidecar/custom-voices');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB（参考音频几秒即可）
});

/** 自定义音色元信息 */
interface CustomVoice {
  id: string;
  name: string;
  /** 音频文件绝对路径（合成时传给侧车） */
  path: string;
  createdAt: string;
}

/** 列出已保存的自定义音色 */
function listCustomVoices(): CustomVoice[] {
  if (!existsSync(CUSTOM_VOICE_DIR)) return [];
  return readdirSync(CUSTOM_VOICE_DIR)
    .filter((f) => /\.(wav|mp3|ogg|flac)$/i.test(f))
    .map((f) => {
      const full = join(CUSTOM_VOICE_DIR, f);
      const id = f.replace(/\.(wav|mp3|ogg|flac)$/i, '');
      // 从同名 .meta.json 读中文名（无则用文件名兜底）
      let name = id;
      try {
        const metaPath = join(CUSTOM_VOICE_DIR, `${id}.meta.json`);
        if (existsSync(metaPath)) {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
          if (meta.name) name = String(meta.name);
        }
      } catch { /* 忽略元信息缺失 */ }
      return {
        id,
        name,
        path: full,
        createdAt: statSync(full).mtime.toISOString(),
      };
    });
}

export function createTtsRouter(): Router {
  const router = Router();

  // POST /api/v1/tts/synthesize - 文本转语音
  router.post('/synthesize', async (req: Request, res: Response): Promise<void> => {
    try {
      const { text, voice, rate, pitch, engine, promptWav, promptText } = req.body as {
        text?: string;
        voice?: string;
        rate?: number;
        pitch?: number;
        engine?: string;
        promptWav?: string;
        promptText?: string;
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
        ...(promptWav ? { promptWav, promptText } : {}),
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

  // ===== T9 自定义音色管理 =====

  // GET /api/v1/tts/custom-voices - 列出自定义音色
  router.get('/custom-voices', (_req: Request, res: Response) => {
    res.json({ voices: listCustomVoices() });
  });

  // POST /api/v1/tts/custom-voices - 上传参考音频创建自定义音色
  router.post('/custom-voices', upload.single('audio'), (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || '自定义音色').slice(0, 30);
      if (!req.file) {
        res.status(400).json({ error: '缺少音频文件', code: 'NO_AUDIO' });
        return;
      }
      const ext = extname(req.file.originalname).toLowerCase() || '.wav';
      if (!['.wav', '.mp3', '.ogg', '.flac'].includes(ext)) {
        res.status(400).json({ error: `不支持的音频格式: ${ext}（支持 wav/mp3/ogg/flac）`, code: 'BAD_FORMAT' });
        return;
      }

      mkdirSync(CUSTOM_VOICE_DIR, { recursive: true });
      // 文件名只用 uuid（避免中文/特殊字符在 URL 路径被解码），中文名存元信息（前缀保留给列表解析）
      const id = `${randomUUID().slice(0, 12)}`;
      const filePath = join(CUSTOM_VOICE_DIR, `${id}${ext}`);
      writeFileSync(filePath, req.file.buffer);
      // 同时写入同名 .meta.json 记录中文名
      writeFileSync(join(CUSTOM_VOICE_DIR, `${id}.meta.json`), JSON.stringify({ name }, null, 2));

      const voice: CustomVoice = { id, name, path: filePath, createdAt: new Date().toISOString() };
      res.status(201).json({ voice });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存音色失败';
      res.status(500).json({ error: msg, code: 'VOICE_SAVE_ERROR' });
    }
  });

  // DELETE /api/v1/tts/custom-voices/:id - 删除自定义音色
  router.delete('/custom-voices/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const file = readdirSync(CUSTOM_VOICE_DIR).find((f) => f.replace(/\.(wav|mp3|ogg|flac)$/i, '') === id);
      if (!file) {
        res.status(404).json({ error: '音色不存在', code: 'VOICE_NOT_FOUND' });
        return;
      }
      unlinkSync(join(CUSTOM_VOICE_DIR, file));
      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除音色失败';
      res.status(500).json({ error: msg, code: 'VOICE_DELETE_ERROR' });
    }
  });

  return router;
}
